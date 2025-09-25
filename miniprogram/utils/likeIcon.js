/**
 * 点赞图标工具函数
 * 根据点赞数返回对应的图标路径
 */

/**
 * 根据点赞数获取对应的图标
 * @param {number} votes 点赞数
 * @param {boolean} isVoted 是否已点赞
 * @returns {string} 图标路径
 */
function getLikeIcon(votes, isVoted) {
  const basePath = '/images/';
  let iconName = '';
  
  if (votes <= 3) {
    // 3以下：发芽
    iconName = 'faya.png'; // 暂时点赞前后使用相同图标
  } else if (votes <= 7) {
    // 4-7：长叶
    iconName = 'zhangye.png'; // 暂时点赞前后使用相同图标
  } else if (votes <= 15) {
    // 8-15：开花
    iconName = 'kaihua.png'; // 暂时点赞前后使用相同图标
  } else {
    // 15以上：结果
    iconName = 'jieguo.png'; // 暂时点赞前后使用相同图标
  }
  
  return basePath + iconName;
}

/**
 * 根据点赞数获取对应的图标描述
 * @param {number} votes 点赞数
 * @returns {string} 图标描述
 */
function getLikeIconDescription(votes) {
  if (votes <= 3) {
    return '发芽';
  } else if (votes <= 7) {
    return '长叶';
  } else if (votes <= 15) {
    return '开花';
  } else {
    return '结果';
  }
}

module.exports = {
  getLikeIcon,
  getLikeIconDescription
};
