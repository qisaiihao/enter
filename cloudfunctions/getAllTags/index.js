// cloudfunctions/getAllTags/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 获取所有帖子的标签
    const postsRes = await db.collection('posts')
      .field({
        tags: true
      })
      .get();

    // 收集所有标签
    const allTags = new Set();
    
    postsRes.data.forEach(post => {
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach(tag => {
          if (tag && tag.trim()) {
            allTags.add(tag.trim());
          }
        });
      }
    });

    // 转换为数组并排序
    const sortedTags = Array.from(allTags).sort();

    return {
      success: true,
      tags: sortedTags,
      count: sortedTags.length
    };
  } catch (error) {
    console.error('获取标签失败:', error);
    return {
      success: false,
      message: '获取标签失败',
      tags: [],
      count: 0
    };
  }
};
