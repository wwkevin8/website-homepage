(function () {
  const priceTable = [
    { kg: 1, hkAir: 51, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 20, taiwan: 41, macau: 42, upsUSA: 67, bpostUSA: 35 },
    { kg: 2, hkAir: 55, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 24.5, taiwan: 46.5, macau: 45.5, upsUSA: 72.5, bpostUSA: 40.5 },
    { kg: 3, hkAir: 57, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 29, taiwan: 52, macau: 49, upsUSA: 78, bpostUSA: 46 },
    { kg: 4, hkAir: 58, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 33.5, taiwan: 57.5, macau: 52.5, upsUSA: 83.5, bpostUSA: 51.5 },
    { kg: 5, hkAir: 59, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 38, taiwan: 63, macau: 56, upsUSA: 89, bpostUSA: 57 },
    { kg: 6, hkAir: 60, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 42.5, taiwan: 68.5, macau: 59.5, upsUSA: 94.5, bpostUSA: 62.5 },
    { kg: 7, hkAir: 62, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 47, taiwan: 74, macau: 63, upsUSA: 100, bpostUSA: 68 },
    { kg: 8, hkAir: 65, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 51.5, taiwan: 79.5, macau: 66.5, upsUSA: 105.5, bpostUSA: 73.5 },
    { kg: 9, hkAir: 68, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 56, taiwan: 85, macau: 70, upsUSA: 111, bpostUSA: 79 },
    { kg: 10, hkAir: 69, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 59.5, taiwan: 90.5, macau: 73.5, upsUSA: 116.5, bpostUSA: 84.5 },
    { kg: 11, hkAir: 71, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 63, taiwan: 96, macau: 77, upsUSA: 122, bpostUSA: 90 },
    { kg: 12, hkAir: 73, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 66.5, taiwan: 101.5, macau: 80.5, upsUSA: 127.5, bpostUSA: 95.5 },
    { kg: 13, hkAir: 75, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 70, taiwan: 107, macau: 84, upsUSA: 133, bpostUSA: 101 },
    { kg: 14, hkAir: 76, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 73.5, taiwan: 112.5, macau: 87.5, upsUSA: 138.5, bpostUSA: 106.5 },
    { kg: 15, hkAir: 79, hkSea: 50, sfTaxIncluded: 75, royalMailAir: 75, taiwan: 118, macau: 91, upsUSA: 144, bpostUSA: 112 },
    { kg: 16, hkAir: 80, hkSea: 55, sfTaxIncluded: 75, royalMailAir: 78, taiwan: 123.5, macau: 94.5, upsUSA: 147.5, bpostUSA: 117.5 },
    { kg: 17, hkAir: 82, hkSea: 55, sfTaxIncluded: 75, royalMailAir: 81, taiwan: 129, macau: 98, upsUSA: 151, bpostUSA: 123 },
    { kg: 18, hkAir: 83, hkSea: 55, sfTaxIncluded: 75, royalMailAir: 84, taiwan: 134.5, macau: 101.5, upsUSA: 154.5, bpostUSA: 128.5 },
    { kg: 19, hkAir: 86, hkSea: 55, sfTaxIncluded: 75, royalMailAir: 87, taiwan: 140, macau: 105, upsUSA: 158, bpostUSA: 134 },
    { kg: 20, hkAir: 87, hkSea: 55, sfTaxIncluded: 75, royalMailAir: 90, taiwan: 145.5, macau: 108.5, upsUSA: 161.5, bpostUSA: 139.5 },
    { kg: 21, hkAir: 89, hkSea: 65, sfTaxIncluded: 75, royalMailAir: 93, taiwan: 151, macau: 112, upsUSA: 165, bpostUSA: 145 },
    { kg: 22, hkAir: 91, hkSea: 65, sfTaxIncluded: 75, royalMailAir: 95, taiwan: 156.5, macau: 115.5, upsUSA: 168.5, bpostUSA: 150.5 },
    { kg: 23, hkAir: 93, hkSea: 65, sfTaxIncluded: 75, royalMailAir: 95, taiwan: 162, macau: 119, upsUSA: 172, bpostUSA: 156 },
    { kg: 24, hkAir: 94, hkSea: 65, sfTaxIncluded: 75, royalMailAir: 99, taiwan: 167.5, macau: 122.5, upsUSA: 175.5, bpostUSA: 161.5 },
    { kg: 25, hkAir: 97, hkSea: 65, sfTaxIncluded: 75, royalMailAir: 103, taiwan: 173, macau: 126, upsUSA: 179, bpostUSA: 167 },
    { kg: 26, hkAir: 98, hkSea: 65, sfTaxIncluded: 80, royalMailAir: 107, taiwan: 178.5, macau: 129.5, upsUSA: 182.5, bpostUSA: 172.5 },
    { kg: 27, hkAir: 100, hkSea: 65, sfTaxIncluded: 80, royalMailAir: 111, taiwan: 184, macau: 133, upsUSA: 186, bpostUSA: 178 },
    { kg: 28, hkAir: 101, hkSea: 65, sfTaxIncluded: 80, royalMailAir: 115, taiwan: 189.5, macau: 136.5, upsUSA: 189.5, bpostUSA: 183.5 },
    { kg: 29, hkAir: 104, hkSea: 65, sfTaxIncluded: 80, royalMailAir: 119, taiwan: 195, macau: 140, upsUSA: 193, bpostUSA: 189 },
    { kg: 30, hkAir: 105, hkSea: 65, sfTaxIncluded: 80, royalMailAir: 124, taiwan: 200.5, macau: 143.5, upsUSA: 196.5, bpostUSA: 194.5 }
  ];

  const routes = [
    { id: "hkAir", name: "香港邮局空运", type: "table" },
    { id: "hkSea", name: "香港邮局海运", type: "table" },
    { id: "sfTaxIncluded", name: "顺丰空运包税", type: "table" },
    { id: "royalMailAir", name: "皇家邮局空运", type: "table" },
    { id: "taiwan", name: "台湾", type: "table" },
    { id: "macau", name: "澳门", type: "table" },
    { id: "upsUSA", name: "UPS 美国", type: "table" },
    { id: "bpostUSA", name: "BPOST 美国", type: "table" },
    { id: "ukDomestic", name: "英国境内", type: "uk" },
    { id: "certificateUps", name: "毕业证 UPS", type: "certificate" },
    { id: "milkPowder", name: "奶粉邮寄", type: "milk" }
  ];

  const routeCards = [
    {
      title: "英国寄中国 · 空运",
      fit: "行李、衣物、日用品、小包裹",
      feature: "速度相对较快，适合多数常规包裹先做比较。",
      note: "香水、电器、带电池产品等敏感品请先咨询。"
    },
    {
      title: "英国寄中国 · 海运",
      fit: "不着急的大件行李、衣物、书籍、杂物",
      feature: "适合 20kg 以上或东西比较多的同学。",
      note: "时效较长，适合不急用的物品。"
    },
    {
      title: "顺丰包税路线",
      fit: "想省心、希望清关流程更简单的同学",
      feature: "价格较高，但资料齐全时流程相对省心。",
      note: "需要按要求准备资料，不适合已经回国或拿不到行李分运单的同学。"
    },
    {
      title: "英国境内邮寄",
      fit: "英国境内搬家、转寄、文件、小包裹",
      feature: "10kg 内 £10；15-30kg £15 起。",
      note: "偏远地区价格可能略高，需以客服确认结果为准。"
    },
    {
      title: "毕业证 UPS 特快",
      fit: "毕业证、重要文件、证书",
      feature: "约 3-6 个工作日；£35 一份，最多 4 份一起寄。",
      note: "每增加一份 +£10，具体时效以承运商当期规则为准。"
    },
    {
      title: "奶粉邮寄",
      fit: "奶粉、母婴用品",
      feature: "2 罐一箱 £12 邮费，含邮包税。",
      note: "需要按要求包装，具体以客服确认为准。"
    }
  ];

  const quickGuides = [
    {
      title: "小包裹 / 轻量物品",
      route: "可优先考虑皇家邮局或空运路线",
      text: "适合小件、文件、轻量物品，具体以重量、体积和当期规则为准。"
    },
    {
      title: "20kg 以上行李",
      route: "可比较香港邮局空运 / 海运",
      text: "适合衣服、书籍、生活用品；是否着急会影响路线选择。"
    },
    {
      title: "20kg 以上且已拿到行李分运单",
      route: "可咨询顺丰包税路线",
      text: "适合想省心、愿意准备资料的同学；资料条件需先确认。"
    },
    {
      title: "不着急的大件行李",
      route: "可优先了解海运",
      text: "适合大量衣物、书、非急用物品；时效通常更长。"
    },
    {
      title: "毕业证 / 重要文件",
      route: "可咨询 UPS 特快",
      text: "适合毕业证、证书、重要文件；时效以承运商当期规则为准。"
    },
    {
      title: "香水、电器、电池等敏感品",
      route: "请先联系客服确认",
      text: "部分路线不能寄；隐瞒物品产生的退回、扣关、延误或损失由用户自行承担。"
    }
  ];

  const boxOptions = [
    { id: "box1", name: "1号箱子", price: 5, size: "50×40×57cm", note: "" },
    { id: "box2", name: "2号箱子", price: 5, size: "60×40×50cm", note: "暂时没货" },
    { id: "box3", name: "3号箱子", price: 4, size: "50×40×40cm", note: "" },
    { id: "box4", name: "4号箱子", price: 3, size: "30×30×40cm", note: "" },
    { id: "box5", name: "5号箱子", price: 2, size: "29×29×24cm", note: "" },
    { id: "box6", name: "6号箱子", price: 1, size: "29×19×26cm", note: "" }
  ];

  const packingMaterials = [
    { name: "小箱子", price: "£2" },
    { name: "中箱子", price: "£3" },
    { name: "大箱子", price: "£5" },
    { name: "胶布", price: "£2" },
    { name: "泡膜", price: "£15 一大卷 / 半卷 £8" }
  ];

  const prohibitedItems = [
    "珠宝、贵重物品",
    "陶瓷、玻璃制品等易碎物品",
    "现金、纸币、纪念币等货币",
    "生鲜、肉类、蛋类、食品罐头",
    "植物、土壤、种子",
    "毒品、管制药品",
    "色情或反动制品",
    "腐蚀性、硫酸、化学制剂等危险品",
    "锋利刀具",
    "易燃易爆物品",
    "枪支、弹药、军刀、弓弩等",
    "赌博用品",
    "奶粉、奶制品部分路线受限",
    "酒精饮品",
    "烟草、电子烟、烟油",
    "电池、充电宝",
    "重要文件，如身份证、签证材料等"
  ];

  const faqs = [
    ["需要提前多久预约？", "建议至少提前 1-2 天预约。6-9 月为邮寄高峰期，建议尽早联系。"],
    ["可以送箱子吗？", "可以。箱子需要单独收费，部分区域可安排送箱，具体以客服确认为准。"],
    ["发 3 箱以上有什么优惠？", "多箱价格会结合路线、重量、体积和取件安排确认，可以把箱数和大概重量发给客服。"],
    ["可以不同公寓取件，寄到国内不同地址吗？", "可以先咨询。多地址取件或多地址派送会影响费用和安排时间。"],
    ["多数同学寄行李适合什么路线？", "常见衣物、书籍和生活用品可先比较空运与海运，是否着急和物品类型会影响选择。"],
    ["为什么自己的旧用品也可能需要交税？", "清关和税费以承运商、海关和目的地国家/地区最新规则为准，旧用品也可能被抽查或要求补充资料。"],
    ["有丢件或赔付吗？", "每个包裹含基础保险。若需要更高保额，可联系客服额外购买保险，具体赔付以承运商规则和保险条款为准。"],
    ["每周什么时候发货？", "发货时间会随路线和旺季安排变化，请以客服当期确认为准。"],
    ["一箱最多可以多重？", "不同路线限制不同。建议单箱重量、尺寸和物品类型都先发给客服确认。"],
    ["行李箱可以直接邮寄吗？", "不建议直接邮寄。行李箱需要装进专用箱子后再寄，避免运输中破损。"],
    ["什么东西不能寄？", "请先查看禁寄提醒；敏感品、食品、电池类、液体类等都建议先联系客服确认。"],
    ["顺丰包税路线需要准备什么资料？", "通常需要按路线要求准备身份证明、行李分运单等材料，具体以客服当期说明为准。"],
    ["如何查询物流？", "客服会根据路线提供查询方式。部分路线需要包裹进入对应国家或地区后才会更新物流。"],
    ["海关抽查怎么办？", "请配合补充资料。抽查、延误、退回等情况以承运商、海关和目的地国家/地区最新规则为准。"],
    ["包裹保险怎么赔付？", "赔付以承运商规则和保险条款为准。贵重或高价值物品建议提前说明并确认是否适合邮寄。"]
  ];

  const trackingLinks = [
    { name: "皇家邮局 / Parcelforce", url: "https://www.parcelforce.com/" },
    { name: "EMS", url: "http://www.ems.com.cn/" },
    { name: "香港邮局", url: "https://webapp.hongkongpost.hk/sc/mail_tracking/index.html" },
    { name: "17Track", url: "https://www.17track.net/" },
    { name: "行李专线", url: "https://parceltraces.com/" }
  ];

  window.PostageData = {
    priceTable,
    routes,
    routeCards,
    quickGuides,
    boxOptions,
    packingMaterials,
    prohibitedItems,
    faqs,
    trackingLinks
  };
})();
