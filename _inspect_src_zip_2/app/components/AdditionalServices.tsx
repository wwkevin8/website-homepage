import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

const services = [
  {
    title: "节日活动",
    description: "圣日，元旦。我们有可住英系统为大分搞线，让筹得宿不在家有所了归属感到。",
  },
  {
    title: "免费咨询就出去",
    description: "位多，巨课。比我不是住学还生院户到做门，我们能住生跟系到每各住吗空白经满。",
  },
  {
    title: "本地生活支持",
    description: "从住去出多进住车，换届。人住的到生编问均能成生完门给先整提流。",
  },
  {
    title: "提房与早期防协助",
    description: "从服务、秩序到入住协助沟通，还能比办多系送样还多层主所接住提供。",
  },
];

export function AdditionalServices() {
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
          <span className="inline-block px-4 py-1.5 bg-blue-50 text-blue-600 text-sm font-light tracking-wider rounded-full">
            适动与福利
          </span>
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
            订房之后，很多落地<br />问题也可以继续往下接
          </h2>
          <p className="text-lg text-slate-600 font-light leading-relaxed max-w-3xl mx-auto">
            首页先经验居整们路，对床说写还已系件经比到多一起总想更。
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group"
            >
              <div className="bg-white border border-slate-100 rounded-2xl p-8 hover:shadow-lg hover:border-slate-200 transition-all duration-300">
                <h3 className="text-xl font-medium text-slate-900 mb-3">{service.title}</h3>
                <p className="text-slate-600 font-light leading-relaxed text-sm">
                  {service.description}
                </p>
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
          className="mt-12 text-center"
        >
          <a
            href="#consult"
            className="inline-flex items-center px-8 py-4 bg-slate-900 text-white rounded-full font-medium hover:bg-slate-800 transition-all duration-300 hover:scale-105"
          >
            查看以往咨询
            <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
