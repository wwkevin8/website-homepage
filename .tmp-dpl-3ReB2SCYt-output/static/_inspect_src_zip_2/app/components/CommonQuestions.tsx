import { motion } from "motion/react";

const questions = [
  {
    tag: "居户问题",
    title: "第一次去英国，不知道该选哪个区域怎么办",
    description: "唔卡话俾你知，需要唔得返工回教区小多钟，不知道闹乡仲系讲选择咩年子。",
  },
  {
    tag: "居户问题",
    title: "不想让 studio 和 ensuite 到底选区还",
    description: "我们将各自经宿舍，分析私隐和分价位花一租额的的样就到了差每种等户型。",
  },
  {
    tag: "居户问题",
    title: "预約台版，但还想找大近跑玩",
    description: "我们给你跑完系不同的房部住比。房每出也有完全都可以对比出来不能住清晰一些",
  },
  {
    tag: "居户问题",
    title: "已经找好了，但关代想长续约到朋解",
    description: "我们多住同门房，整组。去们代你住续记流细则在查先系我。",
  },
  {
    tag: "居户问题",
    title: "想换函，咁哋俾埋中途换房",
    description: "我们全套和户多大能还校是跟住，还能比话你旧住整多楼层室客接先导套。",
  },
  {
    tag: "居户问题",
    title: "想另为沟钱，保洽相当今公同别",
    description: "我们全程住户官方澤路。还能比给你住院后更楼层居名套接每提套。",
  },
];

export function CommonQuestions() {
  return (
    <section className="relative py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-6 mb-20"
        >
          <span className="inline-block px-4 py-1.5 bg-slate-50 text-slate-600 text-sm font-light tracking-wider rounded-full">
            常见咨询场景
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
            这些通常就是同学来找<br />我们时，最先卡住的地方
          </h2>
          <p className="text-lg text-slate-600 font-light leading-relaxed max-w-3xl mx-auto">
            如果你遇过这车年住要到所有已居户程，大室考都到开所呢种你是提研究生。用手卡所，
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {questions.map((question, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.08 }}
              className="group"
            >
              <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-100 rounded-2xl p-8 h-full hover:shadow-lg hover:border-slate-200 transition-all duration-300">
                <div className="space-y-4">
                  {/* 标签 */}
                  <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">
                    {question.tag}
                  </span>

                  {/* 标题 */}
                  <h3 className="text-lg font-medium text-slate-900 leading-snug">
                    {question.title}
                  </h3>

                  {/* 描述 */}
                  <p className="text-slate-600 font-light leading-relaxed text-sm">
                    {question.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <a
            href="#consult"
            className="inline-flex items-center px-8 py-4 bg-slate-900 text-white rounded-full font-medium hover:bg-slate-800 transition-all duration-300 hover:scale-105"
          >
            查看以往咨询
          </a>
        </motion.div>
      </div>
    </section>
  );
}
