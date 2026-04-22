import { motion } from "motion/react";

const partners = [
  { name: "UNITE STUDENTS", logo: "US" },
  { name: "Fresh.", logo: "F." },
  { name: "HELLO STUDENT", logo: "HS" },
  { name: "MEZZINO", logo: "M" },
  { name: "PRESTIGE", logo: "P" },
];

export function PartnerApartments() {
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
          <span className="inline-block px-4 py-1.5 bg-amber-50 text-amber-700 text-sm font-light tracking-wider rounded-full border border-amber-100">
            🏠 PARTNER RESIDENCES
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
            合作公寓资源更透<br />明，订房沟通更稳定
          </h2>
          <p className="text-lg text-slate-600 font-light leading-relaxed max-w-3xl mx-auto">
            长期门课定理学生公寓，我们能完包住代价。价服，仓带守舍代住送研得可还。结些比需事回适户居合。
          </p>
        </motion.div>

        {/* 合作伙伴 Logo 展示 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-16">
          {partners.map((partner, index) => (
            <motion.div
              key={partner.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group"
            >
              <div className="bg-white border border-slate-100 rounded-2xl p-8 flex items-center justify-center h-32 hover:shadow-lg hover:border-slate-200 transition-all duration-300">
                <div className="text-center space-y-2">
                  <div className="text-3xl font-light text-slate-400 group-hover:text-slate-600 transition-colors">
                    {partner.logo}
                  </div>
                  <div className="text-xs text-slate-400 font-light">{partner.name}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 说明文字 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-center"
        >
          <p className="text-slate-500 font-light text-sm">
            与诺丁汉主流学生公寓长期合作，价格透明，服务稳定
          </p>
        </motion.div>
      </div>
    </section>
  );
}
