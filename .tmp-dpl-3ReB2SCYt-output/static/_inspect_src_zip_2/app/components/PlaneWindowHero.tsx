import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

export function PlaneWindowHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // 窗口缩放效果
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.7]);
  const borderRadius = useTransform(scrollYProgress, [0, 0.5], [0, 40]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.6], [1, 1, 0]);
  
  // 文案淡入效果
  const textOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.2], [0, -50]);

  return (
    <div ref={containerRef} className="relative h-[120vh] bg-gradient-to-b from-slate-900 to-slate-800">
      <motion.div
        className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center relative"
        style={{ scale, opacity }}
      >
        {/* 飞机舷窗图片容器 */}
        <motion.div
          className="relative w-full h-full"
          style={{ borderRadius }}
        >
          {/* 主图片 */}
          <div className="absolute inset-0">
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1680211533939-cba54ad6615b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhaXJwbGFuZSUyMHdpbmRvdyUyMGNsb3VkcyUyMHNreSUyMHN1bnNldHxlbnwxfHx8fDE3NzU0Mjk3MTd8MA&ixlib=rb-4.1.0&q=80&w=1080"
              alt="飞机舷窗外的天空和云层"
              className="w-full h-full object-cover"
            />
            {/* 渐变遮罩 */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
          </div>

          {/* 文案内容 */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-6 md:px-12"
            style={{ opacity: textOpacity, y: textY }}
          >
            <div className="max-w-4xl text-center space-y-8">
              {/* 小标签 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                className="inline-block"
              >
                <span className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-md text-white text-sm font-light tracking-wider border border-white/20">
                  YOUR JOURNEY BEGINS
                </span>
              </motion.div>

              {/* 主标题 */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="text-5xl md:text-7xl lg:text-8xl font-light text-white tracking-tight leading-tight"
              >
                帮你更快找到<br />合适公寓
              </motion.h1>

              {/* 副标题 */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.8 }}
                className="text-lg md:text-xl text-white/90 font-light max-w-2xl mx-auto leading-relaxed"
              >
                从选房到订房，再到搬进去后的消费扣、签字补充材料、预约突击检查线路—起搞定。让你不再一个环节一个环节焦灼地等门口。
              </motion.p>

              {/* CTA按钮 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.8 }}
                className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4"
              >
                <a
                  href="#consult"
                  className="px-8 py-4 bg-white text-slate-900 rounded-full font-medium hover:bg-white/90 transition-all duration-300 hover:scale-105"
                >
                  立即咨询
                </a>
                <a
                  href="#services"
                  className="px-8 py-4 bg-white/10 backdrop-blur-md text-white rounded-full font-light border border-white/30 hover:bg-white/20 transition-all duration-300"
                >
                  查看服务方式
                </a>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}