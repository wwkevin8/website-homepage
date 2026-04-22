import { motion } from "motion/react";
import { Plane, Package, TruckIcon, Gift } from "lucide-react";

const benefits = [
  {
    id: "01",
    icon: Plane,
    title: "免费接机",
    description: "落地后抵接到门路前，由同团队成员安排好专属小车。接送方便平安。",
    color: "from-blue-500 to-indigo-500",
    bgColor: "from-blue-50 to-indigo-50",
  },
  {
    id: "02",
    icon: Package,
    title: "免费寄存",
    description: "假期：回国：需租代管一免费的。给你提供校区行李代储费用完全免跟进。",
    color: "from-indigo-500 to-purple-500",
    bgColor: "from-indigo-50 to-purple-50",
  },
  {
    id: "03",
    icon: TruckIcon,
    title: "免费搬家",
    description: "换房转为来要去搬运无法亲自跟进小包。给你这流程需要打包都可行李提供。",
    color: "from-purple-500 to-pink-500",
    bgColor: "from-purple-50 to-pink-50",
  },
  {
    id: "04",
    icon: Gift,
    title: "新生礼包",
    description: "适合初入大学的新宿出的配专属生活用品。保留带在，不需跑走补东西",
    color: "from-pink-500 to-rose-500",
    bgColor: "from-pink-50 to-rose-50",
  },
];

export function MembershipBenefits() {
  return (
    <section className="relative py-32 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-6 mb-20"
        >
          <span className="inline-block px-4 py-1.5 bg-slate-100 text-slate-600 text-sm font-light tracking-wider rounded-full">
            核心卖点
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
            通过我们订房后，可直<br />接获得四选一会员权益
          </h2>
          <p className="text-lg text-slate-600 font-light leading-relaxed max-w-3xl mx-auto">
            同学一位就为办送室看到所谓能帮贺接都订帮起服务这是，让订帮助纯名义之办一起好学。
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group"
            >
              <div className={`relative bg-gradient-to-br ${benefit.bgColor} rounded-3xl p-8 h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-2`}>
                {/* 编号 */}
                <div className="text-sm text-slate-400 font-light mb-4">{benefit.id}</div>
                
                {/* 图标 */}
                <div className={`w-16 h-16 bg-gradient-to-br ${benefit.color} rounded-2xl flex items-center justify-center mb-6 shadow-lg`}>
                  <benefit.icon className="w-8 h-8 text-white" />
                </div>

                {/* 标题 */}
                <h3 className="text-xl font-medium text-slate-900 mb-3">{benefit.title}</h3>

                {/* 描述 */}
                <p className="text-slate-600 font-light leading-relaxed text-sm">
                  {benefit.description}
                </p>

                {/* 装饰性渐变 */}
                <div className={`absolute -bottom-16 -right-16 w-32 h-32 bg-gradient-to-br ${benefit.color} opacity-10 rounded-full blur-3xl`} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* 高亮卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-12"
        >
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 md:p-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-2xl md:text-3xl font-light text-white">
                  满订既馈订房后，可直<br />接获免倒运一找线
                </h3>
                <p className="text-white/70 font-light leading-relaxed">
                  免费满经接的订馆经，只是一间经门订下贺不卡点客户零已经卓全保入做后，房不纯跟订理内同成绩关系了。
                </p>
              </div>
              <div className="flex justify-center md:justify-end">
                <a
                  href="#consult"
                  className="px-8 py-4 bg-white text-slate-900 rounded-full font-medium hover:bg-white/90 transition-all duration-300 hover:scale-105 inline-flex items-center gap-2"
                >
                  立即订房咨询
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
