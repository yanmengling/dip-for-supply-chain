// 翻译资源
export const translations = {
  zh: {
    // 页眉
    header: {
      title: '供应链神经中枢',
      subtitle: 'DIP for Supply Chain',
      simulationMode: '模拟推演中',
      realtimeMode: '实时监控模式',
      exitSimulation: '退出模拟',
      switchMode: '切换模式',
    },
    // 图例
    legend: {
      supplier: '供应商 (Supplier)',
      material: '物料库存 (Material)',
      product: '生产制造 (Product)',
      order: '在途订单 (Order)',
    },
    // 节点类型
    nodeTypes: {
      SUPPLIER: '供应商',
      MATERIAL: '物料',
      PRODUCT: '产品',
      ORDER: '订单',
    },
    // 节点名称
    nodes: {
      suppliers: {
        'SUP-001': '供应商A',
        'SUP-002': '供应商B',
      },
      materials: {
        'MAT-001': '钢材',
        'MAT-002': '铝材',
        'MAT-003': '塑料',
      },
      products: {
        'PROD-001': '产品A',
        'PROD-002': '产品B',
        'PROD-003': '产品C',
        'PROD-004': '产品D',
      },
      orders: {
        'ORD-101': '订单-101',
        'ORD-102': '订单-102',
      },
      clients: {
        '客户A': '客户A',
        '客户B': '客户B',
        '特斯拉': '特斯拉',
      },
    },
    // 右侧面板
    sidebar: {
      selectedObject: '当前选中对象',
      selectObject: '请选择对象',
      bomStructure: 'BOM 结构',
      dailyCapacity: '日产能',
      units: '单位',
      currentStock: '当前库存',
      simulateStock: '模拟库存水位',
      clientName: '客户名称',
      deliveryDue: '交付截止',
      currentStatus: '当前状态',
      potentialRevenue: '潜在营收',
      winProbability: '赢单概率',
      estimatedOrder: '预计下单',
      healthStatus: '健康状态',
      avgDelay: '平均延迟',
      days: '天',
      normal: '正常',
      risk: '风险',
      inTransit: '运输中',
      inProduction: '生产中',
    },
    // 智能助手
    assistant: {
      title: '供应链智能助手 (Copilot)',
      placeholder: '输入指令，例如：查询订单状态、模拟库存风险...',
      quickActions: {
        queryOrder: '查询订单状态',
        optimizeStock: '库存优化分析',
        simulateRisk: '风险模拟',
      },
      welcome: '欢迎使用供应链大脑。当前监控：2家供应商，3类物料库存，4条产品线。请问有什么可以帮您？',
      responses: {
        analyzing: '正在分析全链路数据...',
        orderQuery: '查询结果：订单-101 (客户 A) 目前处于【海运中】，预计 10月20日 交付。订单-102 (客户 B) 正在上海工厂【生产中】，进度正常。',
        stockOptimization: '库存分析：【物料 C】是当前瓶颈。现有库存 150kg 已低于安全水位，且【产品 B】和【产品 C】均依赖该物料。建议：立即向【供应商 B】增加 20% 的采购量以覆盖【项目 Alpha】的潜在需求。',
        riskSimulation: '已为您开启【模拟模式】。系统检测到【供应商 B】存在罢工风险，您可以尝试调整其延迟参数，观察对【产品 B】交付日期的连锁影响。',
      },
    },
    // 语言切换
    language: {
      switch: '切换语言',
      zh: '中文',
      en: 'English',
    },
  },
  en: {
    // Header
    header: {
      title: 'Supply Chain Neural Hub',
      subtitle: 'DIP for Supply Chain',
      simulationMode: 'Simulation Mode',
      realtimeMode: 'Realtime Monitoring',
      exitSimulation: 'Exit Simulation',
      switchMode: 'Switch Mode',
    },
    // Legend
    legend: {
      supplier: 'Supplier',
      material: 'Material Stock',
      product: 'Product Manufacturing',
      order: 'Order In Transit',
    },
    // Node types
    nodeTypes: {
      SUPPLIER: 'Supplier',
      MATERIAL: 'Material',
      PRODUCT: 'Product',
      ORDER: 'Order',
    },
    // Node names
    nodes: {
      suppliers: {
        'SUP-001': 'Supplier A',
        'SUP-002': 'Supplier B',
      },
      materials: {
        'MAT-001': 'Steel',
        'MAT-002': 'Aluminum',
        'MAT-003': 'Plastic',
      },
      products: {
        'PROD-001': 'Product A',
        'PROD-002': 'Product B',
        'PROD-003': 'Product C',
        'PROD-004': 'Product D',
      },
      orders: {
        'ORD-101': 'Order-101',
        'ORD-102': 'Order-102',
      },
      clients: {
        '客户A': 'Client A',
        '客户B': 'Client B',
        '特斯拉': 'Tesla',
      },
    },
    // Sidebar
    sidebar: {
      selectedObject: 'Selected Object',
      selectObject: 'Please select an object',
      bomStructure: 'BOM Structure',
      dailyCapacity: 'Daily Capacity',
      units: 'units',
      currentStock: 'Current Stock',
      simulateStock: 'Simulate Stock Level',
      clientName: 'Client Name',
      deliveryDue: 'Delivery Due',
      currentStatus: 'Current Status',
      potentialRevenue: 'Potential Revenue',
      winProbability: 'Win Probability',
      estimatedOrder: 'Estimated Order Date',
      healthStatus: 'Health Status',
      avgDelay: 'Average Delay',
      days: 'days',
      normal: 'Normal',
      risk: 'Risk',
      inTransit: 'In Transit',
      inProduction: 'In Production',
    },
    // Assistant
    assistant: {
      title: 'Supply Chain AI Assistant (Copilot)',
      placeholder: 'Enter command, e.g.: Query order status, simulate stock risk...',
      quickActions: {
        queryOrder: 'Query Order Status',
        optimizeStock: 'Stock Optimization',
        simulateRisk: 'Risk Simulation',
      },
      welcome: 'Welcome to DIP for Supply Chain. Currently monitoring: 2 suppliers, 3 material stocks, 4 product lines. How can I help you?',
      responses: {
        analyzing: 'Analyzing full-chain data...',
        orderQuery: 'Query results: Order-101 (Client A) is currently [In Shipping], expected delivery on Oct 20. Order-102 (Client B) is [In Production] at Shanghai factory, progress normal.',
        stockOptimization: 'Stock analysis: [Material C] is the current bottleneck. Current stock of 150kg is below safety level, and both [Product B] and [Product C] depend on this material. Recommendation: Immediately increase procurement from [Supplier B] by 20% to cover potential demand from [Project Alpha].',
        riskSimulation: 'Simulation mode enabled. System detected strike risk at [Supplier B]. You can try adjusting its delay parameters to observe the cascading impact on [Product B] delivery date.',
      },
    },
    // Language
    language: {
      switch: 'Switch Language',
      zh: '中文',
      en: 'English',
    },
  },
};

export type Locale = 'zh' | 'en';
export type TranslationKey = keyof typeof translations.zh;

