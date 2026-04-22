import { Navigation } from "./components/Navigation";
import { PlaneWindowHero } from "./components/PlaneWindowHero";
import { TransitionSection } from "./components/TransitionSection";
import { AboutSection } from "./components/AboutSection";
import { ServicesSection } from "./components/ServicesSection";
import { MembershipBenefits } from "./components/MembershipBenefits";
import { WhyChooseUsSection } from "./components/WhyChooseUsSection";
import { CommonQuestions } from "./components/CommonQuestions";
import { CampusSelector } from "./components/CampusSelector";
import { PartnerApartments } from "./components/PartnerApartments";
import { AdditionalServices } from "./components/AdditionalServices";
import { ConsultCTA } from "./components/ConsultCTA";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* 1. 首屏：飞机舷窗 Hero */}
      <PlaneWindowHero />
      
      {/* 2. 第二段：滚动过渡区域 */}
      <TransitionSection />
      
      {/* 3. 第三段：公司介绍 About us */}
      <AboutSection />
      
      {/* 4. 第四段：Services */}
      <ServicesSection />
      
      {/* 5. 会员权益 */}
      <MembershipBenefits />
      
      {/* 6. Why choose us */}
      <WhyChooseUsSection />
      
      {/* 7. 常见问题 */}
      <CommonQuestions />
      
      {/* 8. 校区选择 */}
      <CampusSelector />
      
      {/* 9. 合作公寓 */}
      <PartnerApartments />
      
      {/* 10. 额外服务 */}
      <AdditionalServices />
      
      {/* 11. 最后一段：咨询 CTA */}
      <ConsultCTA />
      
      {/* Footer */}
      <Footer />
    </div>
  );
}