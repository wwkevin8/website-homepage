import { motion } from "motion/react";

export function Footer() {
  return (
    <footer className="bg-slate-900 text-white/80 py-16">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* 品牌信息 */}
          <div className="md:col-span-2 space-y-6">
            <div className="space-y-2">
              <div className="text-2xl font-medium text-white tracking-tight">NGN</div>
              <div className="text-sm text-white/60 font-light tracking-wider">NOTTINGHAM GOOD NEIGHBOR</div>
            </div>
            <p className="text-white/70 font-light leading-relaxed max-w-md">
              左邻右里 · 诺丁汉留学生订房与落地生活服务
            </p>
            <div className="flex gap-4">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
                <span>微</span>
              </div>
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
                <span>小</span>
              </div>
            </div>
          </div>

          {/* 快速链接 */}
          <div className="space-y-4">
            <div className="text-white font-medium mb-4">快速链接</div>
            <nav className="space-y-3 text-sm font-light">
              <a href="#about" className="block hover:text-white transition-colors">关于我们</a>
              <a href="#services" className="block hover:text-white transition-colors">核心服务</a>
              <a href="#why-us" className="block hover:text-white transition-colors">为什么选择我们</a>
              <a href="#consult" className="block hover:text-white transition-colors">立即咨询</a>
            </nav>
          </div>

          {/* 联系方式 */}
          <div className="space-y-4">
            <div className="text-white font-medium mb-4">联系方式</div>
            <div className="space-y-3 text-sm font-light">
              <div>
                <div className="text-white/50 text-xs mb-1">联系方式</div>
                <div className="text-white/70">07941 008555</div>
              </div>
              <div>
                <div className="text-white/50 text-xs mb-1">公司地址</div>
                <div className="text-white/70">
                  Unit 3 Central Ct, Finch Cl,<br />
                  Nottingham NG7 2NN, United Kingdom
                </div>
              </div>
              <div>
                <div className="text-white/50 text-xs mb-1">联系方法</div>
                <div className="text-white/70">info@ngn.best</div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部版权 */}
        <div className="pt-8 border-t border-white/10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-white/50 font-light">
            <div>© 2026 NGN Nottingham Good Neighbor. All rights reserved.</div>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white/80 transition-colors">隐私政策</a>
              <a href="#" className="hover:text-white/80 transition-colors">服务条款</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}