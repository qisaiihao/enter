// 调试收藏夹功能的简单测试
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

async function testFavoriteFolders() {
  try {
    console.log('=== 开始测试收藏夹功能 ===');
    
    // 1. 检查数据库集合是否存在
    console.log('1. 检查favorite_folders集合...');
    const countResult = await db.collection('favorite_folders').count();
    console.log('集合存在，当前记录数:', countResult.total);
    
    // 2. 尝试添加测试数据
    console.log('2. 尝试创建测试收藏夹...');
    const testResult = await db.collection('favorite_folders').add({
      data: {
        _openid: 'test_openid_123',
        name: '测试收藏夹',
        createTime: new Date(),
        updateTime: new Date(),
        itemCount: 0
      }
    });
    
    console.log('测试收藏夹创建成功:', testResult);
    
    // 3. 查询刚创建的数据
    console.log('3. 查询测试数据...');
    const queryResult = await db.collection('favorite_folders').doc(testResult._id).get();
    console.log('查询结果:', queryResult.data);
    
    // 4. 清理测试数据
    console.log('4. 清理测试数据...');
    await db.collection('favorite_folders').doc(testResult._id).remove();
    console.log('测试数据已清理');
    
    console.log('=== 测试完成，收藏夹功能正常 ===');
    
  } catch (error) {
    console.error('测试失败:', error);
    console.error('错误码:', error.code);
    console.error('错误信息:', error.message);
    
    if (error.code === -502001) {
      console.error('集合不存在，需要在云开发控制台创建集合: favorite_folders');
    } else if (error.code === -502002) {
      console.error('数据库权限问题，需要检查集合权限设置');
    }
  }
}

testFavoriteFolders();