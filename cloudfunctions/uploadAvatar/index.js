// 云函数入口文件 - 处理头像上传
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 上传头像云函数
 */
exports.main = async (event, context) => {
  try {
    console.log('🔍 [云函数] uploadAvatar被调用，event:', event);
    
    const { fileData, cloudPath, openid } = event;
    
    if (!fileData || !cloudPath || !openid) {
      return {
        success: false,
        error: '缺少必要参数'
      };
    }
    
    // 将base64转换为Buffer
    const buffer = Buffer.from(fileData, 'base64');
    
    // 上传到云存储
    const result = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: buffer
    });
    
    console.log('✅ [云函数] 文件上传成功:', result);
    
    return {
      success: true,
      fileID: result.fileID
    };
    
  } catch (error) {
    console.error('❌ [云函数] uploadAvatar错误:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
