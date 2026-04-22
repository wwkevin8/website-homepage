import { motion } from "motion/react";
import { MapPin, ArrowRight } from "lucide-react";

const campuses = [
  {
    name: "University Park",
    description: "距离主校区最近工方向，满绿丁堪气。阮贺，化学科学或者学期，住着新书中心。其位美舍是这儿想已起。",
    color: "from-blue-500 to-indigo-500",
    bgColor: "from-blue-50 to-white",
  },
  {
    name: "Jubilee Campus",
    description: "距离校制住跨的方向,满都得出，仓库，修学。请接生还多住中心，用房等可住是教儿已送这。",
    color: "from-purple-500 to-pink-500",
    bgColor: "from-purple-50 to-white",
  },
];

export function CampusSelector() {
  return (
    <section className="relative py-32 bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-6 mb-20"
        >
          <span className="inline-block px-4 py-1.5 bg-slate-100 text-slate-600 text-sm font-light tracking-wider rounded-full">
            校区床聘更新
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
            先搞清楚是你更靠近哪个<br />校区，再判断住法会更快
          </h2>
          <p className="text-lg text-slate-600 font-light leading-relaxed max-w-3xl mx-auto">
            宿室先完成的一个浏多道，如果没吓除吧，详细跟整明系 Park 和 Jubilee 的更好包与环境形本。
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {campuses.map((campus, index) => (
            <motion.div
              key={campus.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="group"
            >
              <div className={`relative bg-gradient-to-br ${campus.bgColor} border border-slate-100 rounded-3xl p-10 h-full hover:shadow-xl hover:border-slate-200 transition-all duration-300`}>
                {/* 图标 */}
                <div className={`w-14 h-14 bg-gradient-to-br ${campus.color} rounded-2xl flex items-center justify-center mb-6 shadow-lg`}>
                  <MapPin className="w-7 h-7 text-white" />
                </div>

                {/* 标题 */}
                <h3 className="text-2xl font-medium text-slate-900 mb-4">{campus.name}</h3>

                {/* 描述 */}
                <p className="text-slate-600 font-light leading-relaxed mb-8">
                  {campus.description}
                </p>

                {/* 按钮 */}
                <div>
                  <button className="inline-flex items-center text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors border border-slate-200 rounded-full px-5 py-2.5 hover:border-slate-300">
                    查看校区详情
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* 装饰性渐变 */}
                <div className={`absolute -bottom-20 -right-20 w-48 h-48 bg-gradient-to-br ${campus.color} opacity-5 rounded-full blur-3xl`} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
