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
    // 3以下：种子
    iconName = isVoted ? 'seedplus.png' : 'seed.png';
  } else if (votes <= 7) {
    // 4-7：叶子
    iconName = isVoted ? 'leafplus.png' : 'leaf.png';
  } else if (votes <= 15) {
    // 8-15：花
    iconName = isVoted ? 'flowerplus .png' : 'flower.png';
  } else {
    // 15以上：果实
    iconName = isVoted ? 'peachplus.png' : 'peach.png';
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
    return '种子';
  } else if (votes <= 7) {
    return '叶子';
  } else if (votes <= 15) {
    return '花';
  } else {
    return '果实';
  }
}

module.exports = {
  getLikeIcon,
  getLikeIconDescription
};
