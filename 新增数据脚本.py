import json
import re
from datetime import datetime, timezone

# --- 配置区 ---
INPUT_TXT_FILE = "poems.txt"
OUTPUT_JSON_FILE = "poems_for_import.json"
DEFAULT_OPENID = "ojYBd1_A3uCbQ1LGcHxWxOAeA5SE" # 再次确认这里是你的 openid

# --- 脚本主逻辑 ---
def convert_txt_to_json_lines():
    try:
        with open(INPUT_TXT_FILE, 'r', encoding='utf-8') as f:
            content = f.read().replace('\r\n', '\n')
    except FileNotFoundError:
        print(f"错误：找不到文件 '{INPUT_TXT_FILE}'。")
        return

    poem_blocks = re.split(r'\n(\s*\n){2,}', content)
    poems_converted_count = 0
    
    print(f"开始处理文件 '{INPUT_TXT_FILE}'...")

    with open(OUTPUT_JSON_FILE, 'w', encoding='utf-8') as f_out:
        for block in poem_blocks:
            block = block.strip()
            if not block:
                continue

            parts = re.split(r'\n\s*\n', block, maxsplit=1)
            
            if len(parts) == 2:
                title = parts[0].strip()
                poem_content = parts[1].strip()
            else:
                print(f"  [!] 警告：跳过格式不正确的诗歌块: '{block[:50]}...'")
                continue

            # --- 这是本次修改的核心 ---
            # 1. 获取当前UTC时间，并格式化为 ISO 8601 格式
            #    这是云数据库导入功能识别日期对象的标准方式
            current_time_iso = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

            poem_data = {
                "title": title,
                "content": poem_content,
                "_openid": DEFAULT_OPENID,
                # 2. 新增 createTime 字段，使用特殊语法导入为 Date 类型
                "createTime": {
                    "$date": current_time_iso
                },
                "commentCount": 0,
                "votes": 0,
                "isPoem": True,
                "isOriginal": False,
                # 3. 修正所有 image 相关字段的类型，与你的数据库保持一致
                "imageUrl": "",              # 修正为 string 类型
                "imageUrls": [],             # 保持 array 类型
                "originalImageUrl": "",      # 修正为 string 类型
                "originalImageUrls": [],     # 保持 array 类型
                "poemBgImage": "",           # 修正为 string 类型
                "tags": ["博尔赫斯"]                   # 保留一个空的 tags 数组，以防万一
            }
            
            json_line = json.dumps(poem_data, ensure_ascii=False)
            f_out.write(json_line + '\n')
            
            poems_converted_count += 1
            print(f"  [✓] 已处理: {title}")

    print(f"\n处理完成！成功转换 {poems_converted_count} 首诗歌。")
    print(f"结果已保存到: '{OUTPUT_JSON_FILE}'")
    print("这是最终版本，解决了 createTime 和字段类型问题，请重新导入。")

if __name__ == "__main__":
    convert_txt_to_json_lines()