import { motion, useScroll, useTransform } from "motion/react";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const { scrollY } = useScroll();
  const backgroundColor = useTransform(
    scrollY,
    [0, 100],
    ["rgba(15, 23, 42, 0)", "rgba(15, 23, 42, 0.95)"]
  );
  const backdropBlur = useTransform(scrollY, [0, 100], [0, 12]);

  // 防止滚动时body溢出
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  const navLinks = [
    { href: "#about", label: "关于我们" },
    { href: "#services", label: "核心服务" },
    { href: "#why-us", label: "为什么选择我们" },
    { href: "#consult", label: "立即咨询" },
  ];

  const handleLinkClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 border-b border-white/10"
        style={{ backgroundColor }}
      >
        <motion.div
          className="backdrop-blur-md"
          style={{ backdropFilter: useTransform(backdropBlur, (v) => `blur(${v}px)`) }}
        >
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <div className="flex items-center justify-between h-20">
              {/* Logo */}
              <a href="#" className="space-y-0.5 group">
                <div className="text-xl font-medium text-white tracking-tight group-hover:text-blue-400 transition-colors">
                  NGN
                </div>
                <div className="text-xs text-white/60 tracking-wider font-light">
                  NOTTINGHAM GOOD NEIGHBOR
                </div>
              </a>

              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center gap-8">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-white/80 hover:text-white text-sm font-light transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="md:hidden w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Toggle menu"
              >
                {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.nav>

      {/* Mobile Menu */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-slate-900/95 backdrop-blur-lg md:hidden"
          style={{ top: "80px" }}
        >
          <nav className="flex flex-col items-center justify-center h-full space-y-8">
            {navLinks.map((link, index) => (
              <motion.a
                key={link.href}
                href={link.href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={handleLinkClick}
                className="text-2xl text-white/90 hover:text-white font-light transition-colors"
              >
                {link.label}
              </motion.a>
            ))}
          </nav>
        </motion.div>
      )}
    </>
  );
}
