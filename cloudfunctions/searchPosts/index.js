// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = _.aggregate;

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { keyword = '', limit = 20 } = event;

  try {
    if (!keyword.trim()) {
      return {
        success: false,
        error: {
          message: '搜索关键词不能为空'
        }
      };
    }

    console.log('搜索关键词:', keyword, '长度:', keyword.length);

    // 先进行一个简单的测试查询，检查数据库中是否有相关数据
    if (keyword.length === 1) {
      console.log('执行测试查询...');
      try {
        const testQuery = await db.collection('posts').where({
          content: keyword
        }).limit(5).get();
        console.log('直接匹配测试结果:', testQuery.data.length, '条记录');
        
        const testQuery2 = await db.collection('posts').where({
          title: keyword
        }).limit(5).get();
        console.log('标题匹配测试结果:', testQuery2.data.length, '条记录');
        
        const testQuery3 = await db.collection('posts').where({
          tags: keyword
        }).limit(5).get();
        console.log('标签匹配测试结果:', testQuery3.data.length, '条记录');
        
        // 检查一些实际的帖子内容
        const sampleQuery = await db.collection('posts').limit(5).get();
        console.log('样本帖子内容:');
        sampleQuery.data.forEach((post, index) => {
          console.log(`帖子${index + 1}:`, {
            title: post.title,
            content: post.content ? post.content.substring(0, 100) : '',
            tags: post.tags
          });
        });
        
        // 特别检查是否包含"以"字的内容
        console.log('检查包含"以"字的内容:');
        let foundYi = false;
        sampleQuery.data.forEach((post, index) => {
          const hasYi = (post.title && post.title.includes('以')) || 
                       (post.content && post.content.includes('以')) ||
                       (post.tags && post.tags.some(tag => tag.includes('以')));
          if (hasYi) {
            foundYi = true;
            console.log(`帖子${index + 1}包含"以"字:`, {
              title: post.title,
              content: post.content ? post.content.substring(0, 100) : '',
              tags: post.tags
            });
          }
        });
        
        if (!foundYi) {
          console.log('在前5个帖子中没有找到包含"以"字的内容');
          // 扩大搜索范围
          const moreQuery = await db.collection('posts').limit(20).get();
          console.log('扩大搜索范围到20个帖子...');
          moreQuery.data.forEach((post, index) => {
            const hasYi = (post.title && post.title.includes('以')) || 
                         (post.content && post.content.includes('以')) ||
                         (post.tags && post.tags.some(tag => tag.includes('以')));
            if (hasYi) {
              console.log(`帖子${index + 1}包含"以"字:`, {
                title: post.title,
                content: post.content ? post.content.substring(0, 100) : '',
                tags: post.tags
              });
            }
          });
          
          // 如果还是没有找到，检查数据库总数
          const totalCount = await db.collection('posts').count();
          console.log('数据库总帖子数:', totalCount.total);
          
          // 尝试搜索特定的标题
          const specificQuery = await db.collection('posts').where({
            title: '玫 瑰'
          }).get();
          console.log('搜索标题"玫 瑰"的结果:', specificQuery.data.length);
          
          if (specificQuery.data.length > 0) {
            const rosePost = specificQuery.data[0];
            console.log('玫瑰帖子的内容片段:', rosePost.content ? rosePost.content.substring(0, 200) : '');
            console.log('玫瑰帖子是否包含"以"字:', rosePost.content ? rosePost.content.includes('以') : false);
          }
        }
      } catch (testError) {
        console.error('测试查询失败:', testError);
      }
    }

    // 使用最简单的查询方式，避免聚合查询的复杂性
    console.log('开始搜索，关键词:', keyword, '字符码:', keyword.charCodeAt(0));
    
    let posts = [];
    
    if (keyword.length === 1) {
      console.log('使用单字符增强查询策略');
      
      // 尝试多种查询方式
      const queries = [
        // 1. 精确匹配
        db.collection('posts').where({ title: keyword }).get(),
        db.collection('posts').where({ content: keyword }).get(),
        db.collection('posts').where({ tags: keyword }).get(),
        // 2. 正则表达式匹配
        db.collection('posts').where({ title: new RegExp(keyword, 'i') }).get(),
        db.collection('posts').where({ content: new RegExp(keyword, 'i') }).get(),
        db.collection('posts').where({ tags: new RegExp(keyword, 'i') }).get(),
        // 3. 数组包含匹配
        db.collection('posts').where({ tags: _.in([keyword]) }).get()
      ];
      
      const results = await Promise.all(queries);
      console.log('各字段查询结果:', {
        title_exact: results[0].data.length,
        content_exact: results[1].data.length,
        tags_exact: results[2].data.length,
        title_regex: results[3].data.length,
        content_regex: results[4].data.length,
        tags_regex: results[5].data.length,
        tags_in: results[6].data.length
      });
      
      // 合并结果并去重
      const allPosts = results.flatMap(result => result.data);
      const uniquePosts = allPosts.filter((post, index, self) => 
        index === self.findIndex(p => p._id === post._id)
      );
      
      posts = uniquePosts;
      console.log('合并后结果数量:', posts.length);
      
    } else {
      console.log('使用多字符正则查询策略');
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedKeyword, 'i');
      
      const queries = [
        db.collection('posts').where({ title: searchRegex }).get(),
        db.collection('posts').where({ content: searchRegex }).get(),
        db.collection('posts').where({ tags: searchRegex }).get()
      ];
      
      const results = await Promise.all(queries);
      console.log('各字段查询结果:', {
        title: results[0].data.length,
        content: results[1].data.length,
        tags: results[2].data.length
      });
      
      // 合并结果并去重
      const allPosts = [...results[0].data, ...results[1].data, ...results[2].data];
      const uniquePosts = allPosts.filter((post, index, self) => 
        index === self.findIndex(p => p._id === post._id)
      );
      
      posts = uniquePosts;
      console.log('合并后结果数量:', posts.length);
    }
    
    // 按创建时间排序
    posts.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
    
    // 限制结果数量
    posts = posts.slice(0, limit);
    
    console.log('最终结果数量:', posts.length);
    console.log('搜索结果详情:', posts.map(p => ({ 
      id: p._id, 
      title: p.title, 
      content: p.content ? p.content.substring(0, 50) + '...' : '',
      tags: p.tags 
    })));

    // 为每个帖子获取作者信息和评论数量
    const enrichedPosts = await Promise.all(posts.map(async (post) => {
      try {
        // 获取作者信息
        const userRes = await db.collection('users').where({
          _openid: post._openid
        }).get();
        const author = userRes.data[0] || { 
          nickName: '匿名用户', 
          avatarUrl: '' 
        };

        // 获取评论数量
        const commentRes = await db.collection('comments').where({
          postId: post._id
        }).count();

        // 获取当前用户的点赞记录
        const voteRes = await db.collection('votes_log').where({
          _openid: wxContext.OPENID,
          postId: post._id
        }).get();

        return {
          ...post,
          authorName: author.nickName,
          authorAvatar: author.avatarUrl,
          commentCount: commentRes.total,
          isVoted: voteRes.data.length > 0,
          tags: post.tags || []
        };
      } catch (error) {
        console.error('获取帖子详情失败:', error);
        return {
          ...post,
          authorName: '匿名用户',
          authorAvatar: '',
          commentCount: 0,
          isVoted: false,
          tags: post.tags || []
        };
      }
    }));

    // 处理图片URL转换
    const fileIDs = new Set();
    
    enrichedPosts.forEach(post => {
      // 保证 imageUrls、originalImageUrls 一定为数组
      if (!Array.isArray(post.imageUrls)) post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      if (!Array.isArray(post.originalImageUrls)) post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      
      // 收集所有需要转换的fileID
      const urlsToCheck = [
        ...post.imageUrls,
        ...post.originalImageUrls,
        post.imageUrl,
        post.originalImageUrl,
        post.authorAvatar,
        post.poemBgImage
      ].filter(url => url && url.startsWith('cloud://'));
      
      urlsToCheck.forEach(url => fileIDs.add(url));
    });

    if (fileIDs.size > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: Array.from(fileIDs) });
        const urlMap = new Map();
        
        fileListResult.fileList.forEach(item => {
          if (item.status === 0) {
            urlMap.set(item.fileID, item.tempFileURL);
          }
        });

        // 批量转换所有帖子的图片URL
        enrichedPosts.forEach(post => {
          const convertUrl = (url) => urlMap.get(url) || url;
          
          if (post.imageUrl) post.imageUrl = convertUrl(post.imageUrl);
          if (post.originalImageUrl) post.originalImageUrl = convertUrl(post.originalImageUrl);
          if (post.authorAvatar) post.authorAvatar = convertUrl(post.authorAvatar);
          if (post.poemBgImage) post.poemBgImage = convertUrl(post.poemBgImage);
          
          if (Array.isArray(post.imageUrls)) {
            post.imageUrls = post.imageUrls.map(convertUrl);
          }
          if (Array.isArray(post.originalImageUrls)) {
            post.originalImageUrls = post.originalImageUrls.map(convertUrl);
          }
        });
      } catch (fileError) {
        console.error('图片URL转换失败:', fileError);
      }
    }

    return {
      success: true,
      posts: enrichedPosts,
      total: enrichedPosts.length
    };

  } catch (e) {
    console.error('搜索失败:', e);
    return {
      success: false,
      error: {
        message: e.message,
        stack: e.stack
      }
    };
  }
};
