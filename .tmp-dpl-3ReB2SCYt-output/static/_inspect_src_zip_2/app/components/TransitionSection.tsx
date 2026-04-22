import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

export function TransitionSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // 文字浮现效果
  const titleOpacity = useTransform(scrollYProgress, [0.2, 0.4], [0, 1]);
  const titleY = useTransform(scrollYProgress, [0.2, 0.4], [50, 0]);
  
  const subtitleOpacity = useTransform(scrollYProgress, [0.3, 0.5], [0, 1]);
  const subtitleY = useTransform(scrollYProgress, [0.3, 0.5], [40, 0]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-800 via-slate-50 to-white overflow-hidden"
    >
      {/* 装饰性云层背景 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none relative">
        <motion.div
          className="absolute top-0 left-0 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl"
          style={{
            opacity: useTransform(scrollYProgress, [0, 0.5], [0.6, 0]),
            x: useTransform(scrollYProgress, [0, 1], [-100, 100]),
          }}
        />
        <motion.div
          className="absolute top-1/4 right-0 w-96 h-96 bg-indigo-100/20 rounded-full blur-3xl"
          style={{
            opacity: useTransform(scrollYProgress, [0, 0.5], [0.4, 0]),
            x: useTransform(scrollYProgress, [0, 1], [100, -100]),
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-12 text-center space-y-12">
        {/* 主标题 */}
        <motion.div
          style={{ opacity: titleOpacity, y: titleY }}
          className="space-y-4"
        >
          <h2 className="text-4xl md:text-6xl font-light text-slate-900 tracking-tight">
            从云端到落地
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 mx-auto rounded-full" />
        </motion.div>

        {/* 副标题 */}
        <motion.p
          style={{ opacity: subtitleOpacity, y: subtitleY }}
          className="text-lg md:text-xl text-slate-600 font-light leading-relaxed max-w-3xl mx-auto"
        >
          当飞机降落在英国的土地上，你的新生活才刚刚开始。
          <br />
          从找房、订房到接机、入住，我们为你打通每一个关键环节。
        </motion.p>

        {/* 三个核心特点 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">🛬</span>
            </div>
            <h3 className="font-medium text-slate-800">抵达英国</h3>
            <p className="text-sm text-slate-500 font-light">从机场到公寓的第一程</p>
          </div>

          <div className="space-y-3">
            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">🏠</span>
            </div>
            <h3 className="font-medium text-slate-800">安顿生活</h3>
            <p className="text-sm text-slate-500 font-light">入住、寄存、换房全流程</p>
          </div>

          <div className="space-y-3">
            <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">🤝</span>
            </div>
            <h3 className="font-medium text-slate-800">持续陪伴</h3>
            <p className="text-sm text-slate-500 font-light">本地团队随时支持</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}