import { motion } from "motion/react";
import { Home, Plane, Package, ArrowRight } from "lucide-react";

const services = [
  {
    icon: Home,
    title: "Local",
    subtitle: "诺丁汉本地面拜访",
    description: "诺丁汉本地订房，直接到门店找我们聊清楚小区、公寓和通勤选择，签字拿钥匙。",
    features: ["本地团队，沟通更快捷", "订房流程透明化", "可在门店约谈咨询"],
    color: "from-blue-500 to-indigo-500",
    bgColor: "from-blue-50 to-indigo-50",
  },
  {
    icon: Package,
    title: "Booking+",
    subtitle: "不只帮订房，更要帮入住",
    description: "不只帮你订房，还帮你入住流程全到门店填表的小区，并帮点对点送到公寓，新同学到房间前来接待。",
    features: ["免费接机", "免费寄存", "入住后续保障"],
    color: "from-indigo-500 to-purple-500",
    bgColor: "from-indigo-50 to-purple-50",
  },
  {
    icon: Plane,
    title: "Full Flow",
    subtitle: "从第一次咨询到拿钥匙当天订房",
    description: "从第一次咨询到拿到钥匙当天订房，帮你同学会在群里梳理所有主选房关卡，让你不踩坑少走弯路。",
    features: ["咨询规划", "签字补材料", "入住衔接"],
    color: "from-purple-500 to-pink-500",
    bgColor: "from-purple-50 to-pink-50",
  },
];

export function ServicesSection() {
  return (
    <section id="services" className="relative py-32 bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-6 mb-20"
        >
          <span className="inline-block px-4 py-1.5 bg-slate-100 text-slate-600 text-sm font-light tracking-wider rounded-full">
            OUR SERVICES
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
            核心服务
          </h2>
          <p className="text-lg text-slate-600 font-light leading-relaxed max-w-3xl mx-auto">
            从到达前的规划，到落地后的生活，我们用专业和耐心陪你走好每一步
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              whileHover={{ y: -8, transition: { duration: 0.3 } }}
              className={`group relative bg-gradient-to-br ${service.bgColor} rounded-3xl overflow-hidden`}
            >
              <div className="relative p-8 space-y-6">
                {/* 图标 */}
                <div className={`w-14 h-14 bg-gradient-to-br ${service.color} rounded-2xl flex items-center justify-center shadow-lg`}>
                  <service.icon className="w-7 h-7 text-white" />
                </div>

                {/* 标题 */}
                <div className="space-y-2">
                  <h3 className="text-2xl font-medium text-slate-900">{service.title}</h3>
                  <p className="text-sm text-slate-500 font-light tracking-wide">{service.subtitle}</p>
                </div>

                {/* 描述 */}
                <p className="text-slate-600 font-light leading-relaxed">
                  {service.description}
                </p>

                {/* 特性列表 */}
                <ul className="space-y-2">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex items-center text-sm text-slate-600 font-light">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full mr-3" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* 悬停效果箭头 */}
                <div className="pt-4">
                  <div className="inline-flex items-center text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                    了解详情
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>

              {/* 装饰性渐变 */}
              <div className={`absolute -bottom-20 -right-20 w-48 h-48 bg-gradient-to-br ${service.color} opacity-10 rounded-full blur-3xl`} />
            </motion.div>
          ))}
        </div>

        {/* 会员权益提示 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 md:p-12 text-center"
        >
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="inline-block px-4 py-1.5 bg-white/10 backdrop-blur-md text-white text-sm font-light tracking-wider rounded-full border border-white/20">
              MEMBERSHIP BENEFITS
            </div>
            <h3 className="text-2xl md:text-3xl font-light text-white">
              通过我们订房，享四选一会员权益
            </h3>
            <p className="text-white/80 font-light leading-relaxed">
              免费接机、免费寄存、免费搬家或新生礼包，任选其一
            </p>
            <a
              href="#consult"
              className="inline-flex items-center px-6 py-3 bg-white text-slate-900 rounded-full font-medium hover:bg-white/90 transition-all duration-300 hover:scale-105"
            >
              了解会员权益
              <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}