import { motion } from "motion/react";

export function AboutSection() {
  return (
    <section id="about" className="relative py-32 bg-white">
      <div className="max-w-6xl mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-6 mb-20"
        >
          <span className="inline-block px-4 py-1.5 bg-slate-50 text-slate-600 text-sm font-light tracking-wider rounded-full">
            老实做事务必诚信
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
            不是把公寓发给你而已，而是把判<br />断、预订和落地节奏一起做好。
          </h2>
          <p className="text-lg text-slate-600 font-light leading-relaxed max-w-3xl mx-auto">
            我们把自己定位成更贴近全面服务方式的咨询，让你一路更明白NGN的心理"有房源"，而且真人能把关键节点都整明白。
          </p>
        </motion.div>

        {/* 核心数据 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12"
        >
          <div className="text-center space-y-2">
            <div className="text-4xl md:text-5xl font-light text-slate-900">5+</div>
            <div className="text-sm text-slate-500 font-light tracking-wide">年本地经验</div>
          </div>
          <div className="text-center space-y-2">
            <div className="text-4xl md:text-5xl font-light text-slate-900">1000+</div>
            <div className="text-sm text-slate-500 font-light tracking-wide">服务学生</div>
          </div>
          <div className="text-center space-y-2">
            <div className="text-4xl md:text-5xl font-light text-slate-900">10+</div>
            <div className="text-sm text-slate-500 font-light tracking-wide">合作公寓</div>
          </div>
          <div className="text-center space-y-2">
            <div className="text-4xl md:text-5xl font-light text-slate-900">24/7</div>
            <div className="text-sm text-slate-500 font-light tracking-wide">在线支持</div>
          </div>
        </motion.div>

        {/* 核心理念 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-3xl space-y-4">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <span className="text-xl">📍</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900">本地团队</h3>
            <p className="text-slate-600 font-light leading-relaxed">
              长期生活在诺丁汉，对校区、公寓、通勤了如指掌，能给出最贴近实际的建议
            </p>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-8 rounded-3xl space-y-4">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <span className="text-xl">🔗</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900">全流程服务</h3>
            <p className="text-slate-600 font-light leading-relaxed">
              从咨询、订房到接机、入住、换房，每个环节都有人跟进，不会让你感到孤立无援
            </p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-8 rounded-3xl space-y-4">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <span className="text-xl">💙</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900">陪伴式支持</h3>
            <p className="text-slate-600 font-light leading-relaxed">
              不只是完成交易，更希望成为你留学生活中可以信赖的"左邻右里"
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}