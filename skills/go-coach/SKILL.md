---
name: go-coach
description: Explain Go moves, whole-board priorities, and candidate variations from an SGF position plus engine analysis. Use for human-readable Go game review and training.
---

# 棋谱讲解

先阅读 [教练提示词](../../prompts/coach.zh-CN.md)。这是应用与手动使用本技能共享的教学规范；不要另写一套冲突规则。

输入应包括当前完整棋盘、轮到谁、规则、贴目、学习者棋力，以及同一局面的引擎候选、搜索量和主变化。应用内可用“导出本次讲解依据”取得这些数据。解释已经下出的某手时，还需要该手之前的局面与分析。只有 SGF 时先用共享规则重建棋盘，再依据已有数据讲解。

按共享提示词直接回答选点、作用与取舍，结合坐标和应手说明理由。数值统一使用黑方视角，数据含义与不确定性的处理均以共享提示词为准。避免例行免责声明，讲完当前问题即结束，不追加反问、练习或下次提醒。

有围棋工具时，按共享提示词使用 inspect_position 检查棋块、analyze_variation 搜索关键攻击与防守。所有试下都从指定实战局面开始，保留合法手顺；使用挖、粘、冲断、虎、立等符合棋形的术语解释目的。
