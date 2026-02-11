const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    };
  }

  try {
    switch (action) {
      case 'toggleFollow':
        return await toggleFollow(OPENID, event.targetOpenid);
      case 'getFollowingList':
        return await getFollowingList(OPENID, event.skip || 0, event.limit || 20);
      case 'getFollowerList':
        return await getFollowerList(OPENID, event.skip || 0, event.limit || 20);
      case 'checkFollow':
        return await checkFollow(OPENID, event.targetOpenid);
      case 'getNewFollowerCount':
        return await getNewFollowerCount(OPENID);
      case 'markFollowNotificationsRead':
        return await markFollowNotificationsRead(OPENID);
      default:
        return {
          success: false,
          message: '未知操作'
        };
    }
  } catch (error) {
    console.error('follow 模块执行失败:', error);
    return {
      success: false,
      message: '操作失败',
      error: error.message
    };
  }
};

async function toggleFollow(followerId, targetOpenid) {
  if (!targetOpenid) {
    return {
      success: false,
      message: '缺少目标用户'
    };
  }

  if (targetOpenid === followerId) {
    return {
      success: false,
      message: '不能关注自己'
    };
  }

  const followsCollection = db.collection('follows');
  const existing = await followsCollection.where({
    followerId,
    followedId: targetOpenid
  }).limit(1).get();

  if (existing.data.length > 0) {
    await followsCollection.doc(existing.data[0]._id).remove();
    return {
      success: true,
      isFollowing: false
    };
  }

  await followsCollection.add({
    data: {
      followerId,
      followedId: targetOpenid,
      createTime: new Date()
    }
  });

  try {
    const followerRes = await db.collection('users').where({
      _openid: followerId
    }).limit(1).get();
    const follower = followerRes.data[0] || {};

    if (targetOpenid !== followerId) {
      await db.collection('messages').add({
        data: {
          fromUserId: followerId,
          fromUserName: follower.nickName || '微信用户',
          fromUserAvatar: follower.avatarUrl || '',
          toUserId: targetOpenid,
          type: 'follow',
          content: `${follower.nickName || '微信用户'} 关注了你`,
          isRead: false,
          createTime: new Date()
        }
      });
    }
  } catch (msgError) {
    console.error('follow 推送关注消息失败:', msgError);
  }

  return {
    success: true,
    isFollowing: true
  };
}

async function getFollowingList(followerId, skip, limit) {
  const followsCollection = db.collection('follows');

  const [listRes, totalRes] = await Promise.all([
    followsCollection.where({ followerId })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get(),
    followsCollection.where({ followerId }).count()
  ]);

  const follows = listRes.data || [];
  const total = totalRes.total || 0;

  if (follows.length === 0) {
    return {
      success: true,
      list: [],
      total,
      hasMore: false
    };
  }

  const followedIds = follows.map(item => item.followedId);

  const [usersRes, mutualRes] = await Promise.all([
    db.collection('users')
      .where({ _openid: _.in(followedIds) })
      .get(),
    followsCollection.where({
      followerId: _.in(followedIds),
      followedId: followerId
    }).get()
  ]);

  const userMap = new Map();
  usersRes.data.forEach(user => {
    userMap.set(user._openid, user);
  });

  const mutualSet = new Set(mutualRes.data.map(item => item.followerId));

  const list = follows.map(item => {
    const user = userMap.get(item.followedId) || {};
    return {
      _openid: item.followedId,
      nickName: user.nickName || '微信用户',
      avatarUrl: user.avatarUrl || '',
      bio: user.bio || '',
      followedAt: item.createTime || null,
      isMutual: mutualSet.has(item.followedId)
    };
  });

  await enrichAvatarUrls(list);

  return {
    success: true,
    list,
    total,
    hasMore: skip + follows.length < total
  };
}

async function getFollowerList(followedId, skip, limit) {
  const followsCollection = db.collection('follows');

  const [listRes, totalRes] = await Promise.all([
    followsCollection.where({ followedId })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get(),
    followsCollection.where({ followedId }).count()
  ]);

  const followers = listRes.data || [];
  const total = totalRes.total || 0;

  if (followers.length === 0) {
    return {
      success: true,
      list: [],
      total,
      hasMore: false
    };
  }

  const followerIds = followers.map(item => item.followerId);

  const [usersRes, mutualRes] = await Promise.all([
    db.collection('users')
      .where({ _openid: _.in(followerIds) })
      .get(),
    followsCollection.where({
      followerId: followedId,
      followedId: _.in(followerIds)
    }).get()
  ]);

  const userMap = new Map();
  usersRes.data.forEach(user => {
    userMap.set(user._openid, user);
  });

  const mutualSet = new Set(mutualRes.data.map(item => item.followedId));

  const list = followers.map(item => {
    const user = userMap.get(item.followerId) || {};
    return {
      _openid: item.followerId,
      nickName: user.nickName || '微信用户',
      avatarUrl: user.avatarUrl || '',
      bio: user.bio || '',
      followedAt: item.createTime || null,
      isMutual: mutualSet.has(item.followerId)
    };
  });

  await enrichAvatarUrls(list);

  return {
    success: true,
    list,
    total,
    hasMore: skip + followers.length < total
  };
}

async function checkFollow(followerId, targetOpenid) {
  if (!targetOpenid) {
    return {
      success: false,
      message: '缺少目标用户'
    };
  }

  if (targetOpenid === followerId) {
    return {
      success: true,
      isFollowing: false,
      isFollower: false,
      isMutual: false
    };
  }

  const followsCollection = db.collection('follows');

  const [followRes, followerRes] = await Promise.all([
    followsCollection.where({
      followerId,
      followedId: targetOpenid
    }).limit(1).get(),
    followsCollection.where({
      followerId: targetOpenid,
      followedId: followerId
    }).limit(1).get()
  ]);

  const isFollowing = followRes.data.length > 0;
  const isFollower = followerRes.data.length > 0;

  return {
    success: true,
    isFollowing,
    isFollower,
    isMutual: isFollowing && isFollower
  };
}

async function getNewFollowerCount(openid) {
  const res = await db.collection('messages').where({
    toUserId: openid,
    isRead: false,
    type: 'follow'
  }).count();

  return {
    success: true,
    count: res.total || 0
  };
}

async function markFollowNotificationsRead(openid) {
  try {
    const res = await db.collection('messages').where({
      toUserId: openid,
      isRead: false,
      type: 'follow'
    }).update({
      data: {
        isRead: true,
        readTime: new Date()
      }
    });

    return {
      success: true,
      updated: res.stats.updated || 0
    };
  } catch (error) {
    console.error('标记关注消息已读失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

async function enrichAvatarUrls(list) {
  const fileIDs = Array.from(new Set(
    list
      .filter(user => user.avatarUrl && user.avatarUrl.startsWith('cloud://'))
      .map(user => user.avatarUrl)
  ));

  if (fileIDs.length === 0) {
    return;
  }

  try {
    const tempUrls = await cloud.getTempFileURL({ fileList: fileIDs });
    const urlMap = new Map();

    tempUrls.fileList.forEach(file => {
      if (file.status === 0) {
        urlMap.set(file.fileID, file.tempFileURL);
      }
    });

    list.forEach(user => {
      if (user.avatarUrl && urlMap.has(user.avatarUrl)) {
        user.avatarUrl = urlMap.get(user.avatarUrl);
      }
    });
  } catch (error) {
    console.error('follow 头像URL转换失败:', error);
  }
}
