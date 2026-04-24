# 供应链数字员工 / TraceAI 对齐理解与行动计划

**背景来源（李基亮 4/19 留言）**
1. 在供应链大脑添加供应链数字员工
2. 在数字员工联动供应链大脑的 web 页面（链接）
3. 可靠性、TraceAI 的场景策划与演示，也要围绕供应链来做
4. 目标对齐：以供应链数字员工场景为抓手，服务于方案、demo、视频，从而推动 KWeaver star 增长
5. 下周六有面向 EBU 的培训，供应链决策智能解决方案是核心方案之一；AI 生产计划助理、AI 采购员两个场景，要结合供应链面板系统性呈现；下周聚焦方案优化与演示

---

## 一、他这几句话真正的意思

这不是单纯让你“再做两个 AI 助手入口”。

他实际在说的是：

### 1. 需要把“供应链大脑”从功能集合，升级成“有角色、有场景、有故事线”的演示系统
也就是不能只是：
- 驾驶舱
- 动态计划协同
- 采购工作台
- 库存优化
- 订单交付
- 供应商评估

而要变成：
- 供应链数字员工体系
- 数字员工如何调用这些面板与工作台
- 数字员工如何帮助人完成任务
- 数字员工的执行过程如何被 Trace / 可靠性能力解释清楚

### 2. 需要一个“统一演示抓手”
这个抓手就是：供应链数字员工。

原因是它可以同时服务 3 件事：
- 方案：讲产品/解决方案时有统一叙事
- demo：演示时有统一主角，不再是零散页面
- 视频：录制时更容易形成连续故事

### 3. 重点不是做“泛 Agent”，而是做“供应链场景化数字员工”
你要围绕的不是通用 AI，而是供应链里的明确岗位角色，例如：
- AI 生产计划助理
- AI 采购员
- 未来可扩展：AI 交付专员、AI 库存分析员、AI 供应商分析员

### 4. TraceAI / 可靠性也要变成供应链故事的一部分
也就是说，TraceAI 不能单独像一个技术监控工具演示。

而是要讲成：
- AI 采购员做出催单建议时，为什么这么判断
- AI 生产计划助理给出缺料/排产建议时，用了哪些数据和规则
- 哪一步是确定结论，哪一步需要人工确认
- 如果结果有误，怎么回看 trace

这样 TraceAI 才是“供应链数字员工可靠运行的保障能力”，不是孤立能力。

### 5. 你的工作不是只做页面，而是主动把“角色-面板-场景-演示-视频”整合成一个计划
这也是他说“你自己主动规划相关的工作计划和任务”的重点。

他的期待不是：
- 你等他继续拆任务

而是：
- 你来反推一个完整推进方案
- 你自己定义优先级
- 你把方案、demo、视频、培训演示串起来

---

## 二、结合当前代码仓库，他要你落到什么东西上

仓库：`/Users/vania.yan/programdemo/chain-neural/SupplyChainBrain`

当前已确认的现状：

### 现有主导航（`src/SupplyChainApp.tsx`）
- 驾驶舱 `cockpit`
- 动态计划协同 `planningV2`
- 采购工作台 `procurementWorkbench`
- 库存优化 `inventory`
- 产品供应优化 `optimization`
- 订单交付 `delivery`
- 供应商评估 `evaluation`
- 配置管理 `config`

### 现有场景骨架已经具备
- AI 生产计划相关：`src/components/views/PlanningViewV2.tsx`
- AI 采购员相关：`src/components/views/ProcurementWorkbenchView.tsx`
- 驾驶舱总入口：`src/components/views/CockpitView.tsx`
- 现有 Copilot 侧边助手：`src/components/shared/CopilotPanel.tsx`
- 视图到助手映射：`src/utils/copilotConfig.ts`
- 驾驶舱图谱入口：`src/components/cockpit/SupplyChainGraphPanel.tsx`

### 当前短板
当前应用更像“模块集合”，还不是“数字员工驱动的方案级演示系统”。
问题主要有 4 个：

1. 没有明确的“数字员工入口层”
2. 没有把 AI 生产计划助理 / AI 采购员包装成统一角色体系
3. 现有 Copilot 是按 view 打开的，不是按岗位角色/任务流打开的
4. Trace / 可靠性能力还没有和具体供应链任务强绑定

---

## 三、所以你现在最该做的事情是什么

可以概括成一句话：

把“供应链大脑”改造成一个以供应链数字员工为入口、以供应链场景为主线、以 TraceAI 可靠性为背书的方案演示系统。

更具体一点，就是 4 条主线：

### 主线 A：做“供应链数字员工入口层”
你需要决定数字员工是放在哪里出现：

优先建议：
1. 驾驶舱首页新增“数字员工”区域
2. 每个重点业务模块挂对应数字员工入口
3. 数字员工卡片可以直接跳转到对应工作页面

建议首批只做 2 个角色：
- AI 生产计划助理
- AI 采购员

### 主线 B：把两个重点角色做成“可讲的业务场景”

#### AI 生产计划助理
对应：`planningV2`
要讲的不是“它能聊天”，而是：
- 帮你接收需求
- 帮你识别缺料/齐套风险
- 帮你生成协同任务
- 帮你给出排产/协同建议

#### AI 采购员
对应：`procurementWorkbench`
要讲的不是“它能问答”，而是：
- 帮你识别催交期任务
- 帮你跟踪 PO/PR
- 帮你识别合同/付款/交期风险
- 帮你形成下一步动作建议

### 主线 C：把 TraceAI / 可靠性嵌入这两个角色演示里
你需要为每个角色定义：
- 输入了什么业务数据
- 做了哪几步判断
- 哪些规则/知识起作用
- 哪些地方要人工确认
- 怎么回看过程

这个部分最终要服务方案和 demo，而不是只服务工程实现。

### 主线 D：形成对外演示资产
最终产物要能服务：
- 下周 EBU 培训
- 方案演示
- 产品 demo
- 视频录制
- GitHub / KWeaver star 增长

---

## 四、建议你马上对外回传的“理解对齐版”

你可以把自己的理解整理成下面这版意思（可直接转成汇报口径）：

1. 以“供应链数字员工”作为统一抓手，而不是继续按分散模块讲功能
2. 首先聚焦两个最强场景：AI 生产计划助理、AI 采购员
3. 在供应链大脑中增加数字员工入口，并打通到对应业务页面
4. 让数字员工不只是聊天入口，而是结合驾驶舱、计划协同、采购工作台做系统性呈现
5. TraceAI / 可靠性演示统一围绕供应链数字员工执行过程展开，展示判断依据、执行轨迹、人工确认和可追溯性
6. 最终沉淀为一套可同时用于方案、demo、培训、视频的统一故事线

---

## 五、你接下来要交付的具体东西

## P0：这周必须明确的 5 个产物

### 1. 数字员工方案定义页
需要回答：
- 什么是供应链数字员工
- 首批为什么是 AI 生产计划助理 + AI 采购员
- 每个角色解决什么问题
- 每个角色如何联动现有面板

### 2. 供应链大脑里的数字员工入口设计
建议落点：
- `src/components/views/CockpitView.tsx`
- 新增一个数字员工展示区/入口区

可能新增文件：
- `src/components/cockpit/DigitalEmployeesPanel.tsx`
- `src/components/cockpit/DigitalEmployeeCard.tsx`

### 3. 数字员工到业务页面的联动关系
要明确：
- AI 生产计划助理 → `planningV2`
- AI 采购员 → `procurementWorkbench`
- 点击后是跳页面、带 context 打开 copilot，还是跳到预设任务页

可能需要修改：
- `src/SupplyChainApp.tsx`
- `src/utils/copilotConfig.ts`
- `src/components/shared/CopilotPanel.tsx`

### 4. TraceAI 供应链场景说明
要明确每个角色的 trace 展示内容：
- 任务输入
- 数据来源
- 风险判断步骤
- 建议生成步骤
- review checkpoint
- 最终输出

### 5. 演示脚本 v1
至少要有一版 3-5 分钟 demo walkthrough：
- 从驾驶舱进入
- 选择数字员工
- 进入角色工作台
- 完成一段任务流
- 展示 trace / 可靠性
- 回到方案总结

---

## 六、按优先级拆成你的实际任务

## 第一优先级：产品/方案定义
你先不要急着写太多代码，先把下面这些写清楚：

1. 供应链数字员工的统一定义
2. 两个首批角色的边界
3. 每个角色连接哪些页面
4. 每个角色的演示任务
5. TraceAI 怎么嵌进去

这是最重要的，因为这是“方案、demo、视频”统一母稿。

## 第二优先级：前端入口层改造
基于当前仓库，最像“该先动”的地方是：

### 入口层
- `src/components/views/CockpitView.tsx`
- `src/components/cockpit/SupplyChainGraphPanel.tsx`

### 角色联动
- `src/SupplyChainApp.tsx`
- `src/utils/copilotConfig.ts`
- `src/components/shared/CopilotPanel.tsx`

### 业务场景承载页
- `src/components/views/PlanningViewV2.tsx`
- `src/components/views/ProcurementWorkbenchView.tsx`

目标不是重做页面，而是给现有页面加一层“数字员工叙事和跳转入口”。

## 第三优先级：TraceAI 可靠性演示打样
这部分短期甚至可以先不做成全功能产品，而是先做 demo 版表达：
- 一页 trace 示例
- 一段执行路径说明
- 一组人工确认点
- 一组风险解释文案

先能讲，后再补深实现。

## 第四优先级：培训/视频包装
最后再整理成：
- 培训讲法
- 视频脚本
- 截图清单
- 演示顺序

---

## 七、你现在最像要立刻启动的工作清单

### 本周你最该做的 7 件事
1. 输出《供应链数字员工方案草案》
2. 输出《AI 生产计划助理 / AI 采购员角色定义》
3. 画《数字员工 → 供应链大脑模块联动图》
4. 在驾驶舱新增数字员工入口设计稿
5. 明确数字员工点击后的交互路径
6. 输出《TraceAI 供应链场景演示脚本》
7. 输出《EBU 培训 demo 流程》

---

## 八、如果只压成一句“我要做什么”

你要做的不是单独再加一个 AI 助手按钮。

你要做的是：
把供应链大脑包装成一个“供应链数字员工驱动”的方案演示产品，先围绕 AI 生产计划助理和 AI 采购员两个角色，把入口、联动页面、TraceAI 可靠性解释、培训 demo 脚本全部串起来。

---

## 九、建议的下一步动作

### 立刻做
1. 先写一页“我对需求的理解 + 拟定工作拆解”
2. 再出一版“数字员工入口和跳转路径”低保真草图
3. 再确定首个要做的代码入口：`CockpitView.tsx`

### 如果开始改代码，最可能先动的文件
- `src/components/views/CockpitView.tsx`
- `src/components/cockpit/SupplyChainGraphPanel.tsx`
- `src/SupplyChainApp.tsx`
- `src/utils/copilotConfig.ts`
- `src/components/shared/CopilotPanel.tsx`
- `src/components/views/PlanningViewV2.tsx`
- `src/components/views/ProcurementWorkbenchView.tsx`

---

## 十、给你的最终判断

他的需求本质上是“方案化”和“故事线统一”。

关键词不是：
- 再做一个助手

而是：
- 供应链数字员工
- 统一入口
- 角色化场景
- 页面联动
- TraceAI 可靠性
- 培训/demo/video 共用一套主线

你现在最重要的工作，就是把这些从一句话，变成可执行的结构和交付物。
