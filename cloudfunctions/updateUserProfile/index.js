const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 更新用户资料
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { avatarUrl, nickName, birthday, bio, signatureUrl, poemId, password } = event;

  try {
    const usersCollection = db.collection('users');
    const currentUserRes = await usersCollection.where({ _openid: openid }).limit(1).get();

    if (!currentUserRes.data || currentUserRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const currentUser = currentUserRes.data[0];

    const updateData = {};
    // Only add fields to the update object if they are provided
    if (avatarUrl) updateData.avatarUrl = avatarUrl; // This is the new fileID
    if (nickName) updateData.nickName = nickName;
    if (birthday) updateData.birthday = birthday;
    if (bio) updateData.bio = bio;
    if (signatureUrl) updateData.signatureUrl = signatureUrl;

    if (typeof poemId === 'string') {
      const trimmedPoemId = poemId.trim();
      if (trimmedPoemId) {
        if (/\s/.test(trimmedPoemId)) {
          return { success: false, message: 'Poem ID不能包含空格' };
        }

        if (currentUser.poemId !== trimmedPoemId) {
          const duplicateRes = await usersCollection.where({
            poemId: trimmedPoemId,
            _openid: _.neq(openid)
          }).limit(1).get();

          if (duplicateRes.data && duplicateRes.data.length > 0) {
            return { success: false, message: 'Poem ID已存在' };
          }
        }

        updateData.poemId = trimmedPoemId;
      }
    }

    if (typeof password === 'string') {
      const trimmedPassword = password.trim();
      if (trimmedPassword) {
        updateData.password = trimmedPassword;
      }
    }

    // Check if there is anything to update
    if (Object.keys(updateData).length === 0) {
      return { success: false, message: '没有需要更新的内容' };
    }

    await usersCollection.doc(currentUser._id).update({
      data: updateData
    });

    return { success: true };

  } catch (e) {
    console.error(e);
    return { success: false, message: '数据库更新失败' };
  }
};