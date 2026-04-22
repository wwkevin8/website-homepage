import { motion } from "motion/react";
import { MapPin, Users, Heart, Sparkles } from "lucide-react";

const reasons = [
  {
    icon: MapPin,
    title: "本地团队，沟通更快捷",
    description: "我们就在诺丁汉本地，能到门店面对面沟通。遇到问题能真正见面解决，而不是远地转述后在线上等。",
  },
  {
    icon: Users,
    title: "订房流程细致明晰",
    description: "从筛选房源到签字，每个细致环节都帮你一起看清楚，我们能照着你的节奏每步细致跟进。",
  },
  {
    icon: Heart,
    title: "细致校区与合同差异",
    description: "不只给你一个价格，而是讲清楚校区、房型配比、入住约定的每条都更明了一层。",
  },
  {
    icon: Sparkles,
    title: "帮助到入住后的持续协助",
    description: "签约、数码、入住这些步的配合和持续跟进援助，帮你同学少遇坑更平顺一些连接上。",
  },
];

export function WhyChooseUsSection() {
  return (
    <section id="why-us" className="relative py-32 bg-white overflow-hidden">
      <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-6 mb-20"
        >
          <span className="inline-block px-4 py-1.5 bg-slate-50 text-slate-500 text-xs font-light tracking-widest rounded-full uppercase">
            Why Choose Us
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
            为什么选择我们
          </h2>
          <p className="text-base text-slate-500 font-light leading-relaxed max-w-2xl mx-auto">
            不只是给你一个公寓链接，而是帮你把"怎么选、怎么订、住进去之后怎么办"这条线一起理顺
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          {reasons.map((reason, index) => (
            <motion.div
              key={reason.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="flex gap-5"
            >
              {/* 图标 */}
              <div className="flex-shrink-0 pt-1">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                  <reason.icon className="w-5 h-5 text-blue-600" />
                </div>
              </div>

              {/* 内容 */}
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-slate-900">
                  {reason.title}
                </h3>
                <p className="text-slate-500 font-light leading-relaxed text-sm">
                  {reason.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 底部标识 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-wrap justify-center items-center gap-8"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-green-50 rounded-full flex items-center justify-center">
              <span className="text-green-600 text-xs">✓</span>
            </div>
            <div className="text-sm text-slate-600">
              <span className="font-medium">诚信经营</span>
              <span className="text-slate-400 text-xs ml-2">Verified Business</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-amber-50 rounded-full flex items-center justify-center">
              <span className="text-amber-600 text-xs">⭐</span>
            </div>
            <div className="text-sm text-slate-600">
              <span className="font-medium">5年+经验</span>
              <span className="text-slate-400 text-xs ml-2">Experienced Team</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}