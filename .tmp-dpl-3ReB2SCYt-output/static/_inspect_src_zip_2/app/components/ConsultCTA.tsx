import { motion } from "motion/react";
import { Phone, Mail, MessageCircle, ArrowRight } from "lucide-react";

export function ConsultCTA() {
  return (
    <section id="consult" className="relative py-32 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* 装饰性背景 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      {/* 网格背景 */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-8"
        >
          {/* 标签 */}
          <div className="inline-block px-4 py-1.5 bg-white/10 backdrop-blur-md text-white text-sm font-light tracking-wider rounded-full border border-white/20">
            GET IN TOUCH
          </div>

          {/* 标题 */}
          <h2 className="text-4xl md:text-6xl font-light text-white tracking-tight leading-tight">
            还没确定住哪里？把预算、校<br />区、入住时间发给我们。
          </h2>

          {/* 描述 */}
          <p className="text-lg md:text-xl text-white/80 font-light leading-relaxed max-w-2xl mx-auto">
            先问哪些呢的也经到我们订知门，系我们会看后整合冰点哦。
          </p>

          {/* 联系方式卡片 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8"
          >
            {/* 电话 */}
            <a
              href="tel:07941008555"
              className="group bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Phone className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-sm text-white/60 font-light mb-1">电话咨询</div>
                  <div className="text-white font-medium">07941 008 555</div>
                </div>
                <div className="text-xs text-white/50 font-light">周一至周五 8:00-18:00</div>
              </div>
            </a>

            {/* 微信 */}
            <div className="group bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300 cursor-pointer">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-sm text-white/60 font-light mb-1">微信咨询</div>
                  <div className="text-white font-medium">扫码添加</div>
                </div>
                <div className="text-xs text-white/50 font-light">即时沟通更便捷</div>
              </div>
            </div>

            {/* 邮件 */}
            <a
              href="mailto:info@ngn-nottingham.com"
              className="group bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-sm text-white/60 font-light mb-1">邮件咨询</div>
                  <div className="text-white font-medium text-sm">info@ngn.com</div>
                </div>
                <div className="text-xs text-white/50 font-light">详细咨询留言</div>
              </div>
            </a>
          </motion.div>

          {/* 主要CTA按钮 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="pt-8"
          >
            <a
              href="tel:07941008555"
              className="inline-flex items-center px-8 py-4 bg-white text-slate-900 rounded-full font-medium hover:bg-white/90 transition-all duration-300 hover:scale-105 shadow-2xl shadow-white/20"
            >
              立即开始咨询
              <ArrowRight className="w-5 h-5 ml-2" />
            </a>
          </motion.div>

          {/* 底部提示 */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="pt-8 flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm text-white/60 font-light"
          >
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              快速响应
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
              专业建议
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
              全程跟进
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}