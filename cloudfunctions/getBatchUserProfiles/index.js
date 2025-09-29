// 批量获取用户信息云函数
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { userIds } = event;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return {
      success: false,
      message: '用户ID列表不能为空'
    };
  }

  try {
    // 批量获取用户信息
    const usersRes = await db.collection('users')
      .where({
        _openid: _.in(userIds)
      })
      .get();

    const userProfiles = usersRes.data || [];

    // 处理头像URL
    await enrichAvatarUrls(userProfiles);

    return {
      success: true,
      userProfiles: userProfiles
    };
  } catch (error) {
    console.error('批量获取用户信息失败:', error);
    return {
      success: false,
      message: '获取用户信息失败',
      error: error.message
    };
  }
};

// 处理头像URL
async function enrichAvatarUrls(users) {
  const fileIDs = Array.from(new Set(
    users
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

    users.forEach(user => {
      if (user.avatarUrl && urlMap.has(user.avatarUrl)) {
        user.avatarUrl = urlMap.get(user.avatarUrl);
      }
    });
  } catch (error) {
    console.error('头像URL转换失败:', error);
  }
}
