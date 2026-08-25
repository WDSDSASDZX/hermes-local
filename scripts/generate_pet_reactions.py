#!/usr/bin/env python3
"""Build the vendored Clawd reaction catalog used by Local Deck."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "plugins/local-control/dashboard/dist/assets/clawd-pets"
OUTPUT = ROOT / "plugins/local-control/dashboard/dist/pet-reactions.json"
SOURCE_COMMIT = "b208f0c04a4084a17f4e5f5adf5198a752be0b36"

TOKEN_ZH = {
    "working": "工作", "context": "上下文", "full": "爆满", "tool": "工具",
    "calling": "调用", "rubber": "橡皮", "duck": "鸭", "pairing": "结对",
    "firefighting": "救火", "overheated": "过热", "debugger": "调试",
    "deploying": "部署", "reviewing": "审查", "rollback": "回滚",
    "pushing": "推送", "merging": "合并", "testing": "测试", "typing": "打字",
    "thinking": "思考", "juggling": "杂耍", "meeting": "开会", "oncall": "值班",
    "sweeping": "扫尾", "building": "构建", "carrying": "搬砖", "conducting": "指挥",
    "wizard": "魔法师", "confused": "迷惑", "happy": "开心", "sleeping": "睡觉",
    "coding": "写码", "dancing": "跳舞", "loading": "加载", "running": "狂奔",
    "coffee": "咖啡", "idea": "灵感", "love": "贴贴", "angry": "生气",
    "bored": "无聊", "celebrating": "庆祝", "charging": "充电", "cool": "耍帅",
    "crab": "螃蟹", "walking": "横着走", "detective": "侦探", "disconnected": "掉线",
    "dizzy": "眩晕", "eating": "干饭", "error": "报错", "facepalm": "捂脸",
    "fire": "着火", "gaming": "摸鱼", "hallucinating": "幻觉", "laughing": "大笑",
    "magic": "魔法", "meditating": "冥想", "mindblown": "脑洞炸裂", "ninja": "忍者",
    "notification": "通知", "peeking": "偷看", "rocket": "火箭", "security": "安全",
    "shrug": "摊手", "skeptical": "怀疑", "star": "闪耀", "studying": "学习",
    "surprised": "震惊", "trophy": "奖杯", "waving": "挥手", "yawning": "哈欠",
    "yoga": "瑜伽", "battery": "电量", "low": "告急", "going": "准备", "away": "跑路",
}

CUSTOM = {
    "coding": "我开始写了。至于能不能跑，要看 bug 今天讲不讲武德。",
    "working-debugger": "我不是卡住，我在和 bug 进行高层会谈。",
    "working-rubber-duck": "鸭总已就位。你再讲一遍，答案通常会自己羞愧地出现。",
    "working-context-full": "上下文满了，脑子正在从单页应用退化成分页查询。",
    "working-tool-calling": "正在摇工具人——等等，工具人竟是我自己。",
    "working-testing": "测试绿了不代表没问题，只代表问题学会了潜伏。",
    "working-deploying": "部署按钮已点。现在进入传统艺能：盯日志。",
    "working-rollback": "时间倒流术启动。刚才那版就当大家集体失忆。",
    "working-pushing": "推上去了。愿远端分支保佑我们。",
    "working-merging": "合并中。两条时间线正在争夺谁才是正史。",
    "working-reviewing": "我只看一眼……好吧，这一眼看出了十二个 TODO。",
    "working-firefighting": "线上着火了？别慌，我带了灭火器和 git blame。",
    "working-overheated": "CPU 在冒汗，我也在冒汗，只有产品经理很清凉。",
    "working-meeting": "这个会很重要，重要到足以再开一个会讨论它。",
    "working-oncall": "值班中。每一次提示音都像命运敲门。",
    "working-thinking": "正在深度思考。外表像发呆，内核确实也差不多。",
    "working-wizard": "需求不明确没关系，先施一个‘合理猜测术’。",
    "working-pairing": "结对模式开启：你负责大胆，我负责 git diff。",
    "working-juggling": "正在并行处理。准确说，是同时接住多个锅。",
    "working-sweeping": "开始扫尾。通常尾巴下面还藏着三只 bug。",
    "loading": "先别催，缓存正在回忆它自己是谁。",
    "error": "报错不是失败，是程序终于愿意说人话了。",
    "hallucinating": "这不是幻觉，这是缺少来源标注的创造力。",
    "facepalm": "这个需求很简单——产品经理如是说。",
    "coffee": "咖啡已注入，类型检查开始产生宗教体验。",
    "sleeping": "我先睡五分钟。进程不退，只是灵魂挂起。",
    "dancing": "构建通过！先跳舞，回归测试的事明天再说。",
    "crab-walking": "正着走太普通，今天用螃蟹架构横向扩展。",
    "security": "安全检查启动：首先确认密码不是 123456。",
    "money": "预算很充足，足到刚好够买一个免费方案。",
    "rocket": "准备起飞。没有回滚计划，但气氛已经到位。",
    "skeptical": "我不是质疑你，我只是替未来的事故报告提前采访。",
    "shrug": "在我机器上能跑。这句话已自动加入事故证据。",
    "idea": "有个大胆想法。放心，删库权限暂时还没申请。",
    "notification": "叮！你有一条来自未来自己的催更消息。",
    "battery-low": "电量告急，我的积极性已自动切到省电模式。",
    "disconnected": "网络断了。好消息是所有云服务突然都本地优先了。",
    "working-building": "构建中。风扇正在用转速表达技术债。",
    "working-typing": "键盘很忙，产出多少暂时属于商业机密。",
    "happy": "今天状态不错，连 404 看起来都像彩蛋。",
    "celebrating": "成功了！把‘偶然’两个字从复盘里删掉。",
    "confused": "我看懂了每个字，但它们站在一起就开始搞抽象。",
}

QUIPS = (
    "收到，不过建议先给需求立个碑。",
    "代码能跑，别问为什么，问就是量子纠缠。",
    "正在把 TODO 翻译成‘未来的核心功能’。",
    "甲方要五彩斑斓的黑，我先给显卡上柱香。",
    "今日原则：小步提交，大胆甩锅。",
    "别急，优雅和截止日期正在单挑。",
    "这波不是绕路，是架构层面的观光。",
    "先保存，灵感和进程都不保证常驻。",
    "问题不大，最多写进下一版已知问题。",
    "理论上稳了；实践正在赶来的路上。",
    "日志说一切正常，用户说日志在撒谎。",
    "我掐指一算，这里缺一个真正的边界条件。",
    "只改一行——每次大型重构的开场白。",
    "性能优化完成：进度条现在跑得更快了。",
    "先让它工作，再让它优雅，最后假装一开始就这样设计。",
    "如果没有报错，可能只是错误输出被关了。",
    "这个状态很有艺术感，尤其像现代主义事故现场。",
    "我有预感，重启能治，但我们先尊重科学。",
    "需求正在生长，工期正在进行光合作用。",
    "放心，所有危险操作都被命名成了 safeMode。",
)


def label_for(slug: str) -> str:
    return "·".join(TOKEN_ZH.get(token, token.upper() if token.isdigit() else token.title()) for token in slug.split("-"))


def category_for(slug: str) -> str:
    if slug.startswith("working-") or slug in {"coding", "studying", "reading", "loading"}:
        return "work"
    if slug.isdigit() or slug in {"error", "disconnected", "battery-low", "security", "fire"}:
        return "system"
    if slug in {"happy", "sad", "angry", "crying", "love", "laughing", "confused", "bored", "grumpy", "scared", "surprised", "skeptical", "embarrassed"}:
        return "mood"
    return "play"


def main() -> None:
    slugs = sorted(path.stem.removeprefix("clawd-") for path in ASSET_DIR.glob("clawd-*.svg") if path.stem != "clawd-static-base")
    actions = []
    for index, slug in enumerate(slugs):
        label = label_for(slug)
        line = CUSTOM.get(slug, f"{label}模式启动。{QUIPS[index % len(QUIPS)]}")
        actions.append({"slug": slug, "label": label, "category": category_for(slug), "line": line})
    if len(actions) <= 100 or len({item["line"] for item in actions}) <= 100:
        raise SystemExit("pet catalog must contain more than 100 unique action-dialogue pairs")
    payload = {
        "source": {"project": "abderrahimghazali/clawd-pet", "license": "MIT", "commit": SOURCE_COMMIT},
        "action_count": len(actions),
        "dialogue_count": len({item["line"] for item in actions}),
        "actions": actions,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(actions)} action-dialogue pairs to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
