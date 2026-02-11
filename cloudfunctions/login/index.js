// 云函数入口文件 - 兼容微信云开发和CloudBase
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 通用login函数，处理来自小程序、App、Web的调用
 */
exports.main = async (event, context) => {
  try {
    console.log('🔍 [云函数] login被调用，event:', event);
    console.log('🔍 [云函数] login被调用，context:', context);
    
    const wxContext = cloud.getWXContext();
    console.log('🔍 [云函数] wxContext:', wxContext);
    
    // 在H5环境下，wxContext.OPENID可能为空，使用context中的信息
    const openid = wxContext.OPENID || context.OPENID || 'anonymous_' + Date.now();
    const appid = wxContext.APPID || context.APPID || 'unknown';
    const unionid = wxContext.UNIONID || context.UNIONID || null;
    
    console.log('🔍 [云函数] 最终openid:', openid);
    
    // 返回兼容格式，同时支持微信云开发和CloudBase
    const result = {
      // 微信云开发格式（小程序兼容）
      event,
      openid: openid,
      appid: appid,
      unionid: unionid,
      
      // CloudBase格式（H5兼容）
      success: true,
      uid: openid, // 使用openid作为uid
      result: {
        openid: openid,
        uid: openid,
        appid: appid,
        unionid: unionid
      }
    };
    
    console.log('🔍 [云函数] 返回结果:', result);
    return result;
  } catch (error) {
    console.error('登录云函数错误:', error);
    return {
      success: false,
      error: error.message,
      result: null
    };
  }
};