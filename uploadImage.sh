#!/bin/bash

# 小程序图片上传脚本
# 使用方法: ./uploadImage.sh <图片路径> [分类] [名称]

IMAGE_PATH=$1
CATEGORY=$2
NAME=$3

if [ -z "$IMAGE_PATH" ]; then
    echo "使用方法: ./uploadImage.sh <图片路径> [分类] [名称]"
    echo "示例: ./uploadImage.sh ./splash.png splash splash"
    exit 1
fi

if [ ! -f "$IMAGE_PATH" ]; then
    echo "错误: 文件 $IMAGE_PATH 不存在"
    exit 1
fi

# 默认分类和名称
CATEGORY=${CATEGORY:-"general"}
NAME=${NAME:-"$(basename "$IMAGE_PATH" | sed 's/\..*//')"}

echo "准备上传图片..."
echo "文件路径: $IMAGE_PATH"
echo "分类: $CATEGORY"
echo "名称: $NAME"

# 这里需要你在微信开发者工具中运行，或者使用微信开发者工具的CLI
# 由于安全限制，实际的文件读取和上传需要在小程序环境中执行

echo "请在微信开发者工具中执行以下操作："
echo "1. 打开小程序项目"
echo "2. 进入云开发控制台"
echo "3. 在数据库中创建 'images' 集合"
echo "4. 部署 imageManager 云函数"
echo "5. 在小程序中访问图片管理页面上传图片"
echo ""
echo "或者直接访问小程序中的图片管理页面进行上传"