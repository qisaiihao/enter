// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { nickName, avatarUrl } = event;

  // 获取用户标识，与login云函数保持一致
  const openid = wxContext.OPENID || event.openid || context.OPENID;
  console.log('🔍 [updateUser] 获取到的openid:', openid);
  console.log('🔍 [updateUser] wxContext:', wxContext);
  console.log('🔍 [updateUser] event:', event);
  console.log('🔍 [updateUser] context:', context);

  if (!openid) {
    return {
      success: false,
      message: '无法获取用户openid'
    };
  }

  try {
    console.log('🔍 [updateUser] 开始查询用户，openid:', openid);
    
    // 使用统一的_openid字段，与项目其他云函数保持一致
    const userRecord = await db.collection('users').where({
      _openid: openid
    }).get();
    
    console.log('🔍 [updateUser] 查询结果:', userRecord);
    console.log('🔍 [updateUser] 查询到的用户数量:', userRecord.data.length);

    if (userRecord.data.length > 0) {
      // User exists, update it
      console.log('🔍 [updateUser] 用户已存在，执行更新');
      await db.collection('users').where({
        _openid: openid
      }).update({
        data: {
          nickName,
          avatarUrl,
          updatedAt: new Date()
        }
      });
    } else {
      // User does not exist, add it
      console.log('🔍 [updateUser] 用户不存在，执行创建');
      await db.collection('users').add({
        data: {
          _openid: openid,
          nickName,
          avatarUrl,
          createdAt: new Date()
        }
      });
    }

    // On success, explicitly return a success object that the client expects
    return {
      success: true,
      message: 'User updated successfully.'
    };

  } catch (e) {
    console.error('❌ [updateUser] 数据库操作失败:', e);
    console.error('❌ [updateUser] 错误详情:', JSON.stringify(e, null, 2));
    console.error('❌ [updateUser] 错误类型:', typeof e);
    console.error('❌ [updateUser] 错误消息:', e.message);
    console.error('❌ [updateUser] 错误堆栈:', e.stack);
    
    // On failure, explicitly return a failure object
    return {
      success: false,
      message: '数据库操作失败: ' + (e.message || '未知错误'),
      error: e.message || e.toString()
    };
  }
};