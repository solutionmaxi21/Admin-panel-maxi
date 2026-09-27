"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, MapPin, Phone, Clock, Warehouse } from "lucide-react"
import { CONTACT_INFO, COMPANY_INFO, BUSINESS_HOURS } from "@/config/constants"
import { useLanguage } from "@/lib/language-context"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

export default function AboutPage() {
  const { language } = useLanguage()

  const localT = {
    fr: {
      title: `À Propos de ${COMPANY_INFO.name}`,
      intro: `Bienvenue chez ${COMPANY_INFO.name}, la première destination en Algérie pour le matériel informatique, les composants et les accessoires. Depuis ${COMPANY_INFO.foundedYear}, nous nous engageons à fournir les meilleurs produits technologiques à nos clients à travers l'Algérie.`,
      mission: {
        title: "Notre Mission",
        desc: "Fournir du matériel informatique de haute qualité et un service client exceptionnel aux passionnés de technologie, aux joueurs et aux professionnels à travers l'Algérie. Nous nous efforçons d'offrir des prix compétitifs et les derniers produits du marché."
      },
      vision: {
        title: "Notre Vision",
        desc: "Devenir le détaillant technologique le plus fiable en Algérie, connu pour notre vaste gamme de produits, nos conseils d'experts et notre approche centrée sur le client."
      },
      whyChooseUs: {
        title: "Pourquoi Nous Choisir?",
        items: [
          { title: "Produits Authentiques:", desc: "Tous nos produits sont 100% authentiques et proviennent de distributeurs autorisés" },
          { title: "Prix Compétitifs:", desc: "Nous offrons les meilleurs prix du marché sans compromettre la qualité" },
          { title: "Support Expert:", desc: "Notre équipe compétente est toujours prête à vous aider à faire le bon choix" },
          { title: "Protection Garantie:", desc: "Tous les produits sont couverts par les garanties fabricant et notre support après-vente" },
          { title: "Livraison Rapide:", desc: "Livraison gratuite sur les commandes de plus de 50 000 DZD à travers l'Algérie" }
        ]
      },
      contact: {
        title: "Informations de Contact",
        address: "Adresse",
        phone: "Téléphone",
        email: "Email",
        hours: "Heures d'Ouverture"
      },
      warehouses: {
        title: "Nos Entrepôts",
        alger: {
          name: "Entrepôt Dely Ibrahim (Alger)",
          address: "16 Bouchbouk, Dely Ibrahim, Alger 16000",
          desc: "Notre centre de distribution principal assurant les livraisons rapides sur Alger et ses environs."
        },
        skikda: {
          name: "Entrepôt Harrouch (Skikda)",
          address: "Zone Industrielle Harrouch, Skikda",
          desc: "Notre hub logistique régional pour l'est algérien, optimisant les délais de livraison."
        }
      }
    },
    ar: {
      title: `من نحن - ${COMPANY_INFO.name}`,
      intro: `مرحباً بكم في ${COMPANY_INFO.name}، الوجهة الأولى في الجزائر لأجهزة الكمبيوتر والمكونات والملحقات. منذ عام ${COMPANY_INFO.foundedYear}، نحن ملتزمون بتقديم أفضل المنتجات التقنية لعملائنا في جميع أنحاء الجزائر.`,
      mission: {
        title: "مهمتنا",
        desc: "توفير أجهزة كمبيوتر عالية الجودة وخدمة عملاء استثنائية لعشاق التكنولوجيا واللاعبين والمحترفين في جميع أنحاء الجزائر. نسعى جاهدين لتقديم أسعار تنافسية وأحدث المنتجات في السوق."
      },
      vision: {
        title: "رؤيتنا",
        desc: "أن نصبح بائع التجزئة التكنولوجي الأكثر موثوقية في الجزائر، والمعروف بمجموعتنا الواسعة من المنتجات، ونصائح الخبراء، ونهجنا الذي يركز على العملاء."
      },
      whyChooseUs: {
        title: "لماذا تختارنا؟",
        items: [
          { title: "منتجات أصلية:", desc: "جميع منتجاتنا أصلية 100% وتأتي من موزعين معتمدين" },
          { title: "أسعار تنافسية:", desc: "نقدم أفضل الأسعار في السوق دون المساومة على الجودة" },
          { title: "دعم الخبراء:", desc: "فريقنا المتخصص مستعد دائماً لمساعدتك في اتخاذ القرار الصحيح" },
          { title: "ضمان الحماية:", desc: "جميع المنتجات مشمولة بضمانات الشركة المصنعة وخدمة ما بعد البيع لدينا" },
          { title: "توصيل سريع:", desc: "توصيل مجاني للطلبات التي تزيد عن 50,000 دج في جميع أنحاء الجزائر" }
        ]
      },
      contact: {
        title: "معلومات الاتصال",
        address: "العنوان",
        phone: "الهاتف",
        email: "البريد الإلكتروني",
        hours: "ساعات العمل"
      },
      warehouses: {
        title: "مستودعاتنا",
        alger: {
          name: "مستودع دالي إبراهيم (الجزائر العاصمة)",
          address: "16 بوشبوق، دالي إبراهيم، الجزائر العاصمة 16000",
          desc: "مركز توزيعنا الرئيسي الذي يضمن توصيلًا سريعًا في الجزائر العاصمة وضواحيها."
        },
        skikda: {
          name: "مستودع الحروش (سكيكدة)",
          address: "المنطقة الصناعية الحروش، سكيكدة",
          desc: "مركزنا اللوجستي الإقليمي للشرق الجزائري، مما يحسن مواعيد التوصيل."
        }
      }
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-6">{txt.title}</h1>

            <div className="prose prose-lg max-w-none mb-12">
              <p className="text-lg text-muted-foreground">
                {txt.intro}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <Card>
                <CardHeader>
                  <CardTitle>{txt.mission.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {txt.mission.desc}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{txt.vision.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {txt.vision.desc}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-12">
              <CardHeader>
                <CardTitle>{txt.whyChooseUs.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {txt.whyChooseUs.items.map((item, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary font-bold">✓</span>
                      <span><strong>{item.title}</strong> {item.desc}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <div className="mb-12">
              <h2 className="text-3xl font-bold mb-6">{txt.warehouses.title}</h2>
              <div className="grid md:grid-cols-2 gap-8">
                <Card>
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Warehouse className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{txt.warehouses.alger.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-1 shrink-0" />
                      {txt.warehouses.alger.address}
                    </p>
                    <p className="text-sm">
                      {txt.warehouses.alger.desc}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Warehouse className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{txt.warehouses.skikda.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-1 shrink-0" />
                      {txt.warehouses.skikda.address}
                    </p>
                    <p className="text-sm">
                      {txt.warehouses.skikda.desc}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{txt.contact.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className={`h-5 w-5 text-primary mt-0.5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                  <div>
                    <p className="font-medium">{txt.contact.address}</p>
                    <p className="text-muted-foreground">{CONTACT_INFO.address.street}, {CONTACT_INFO.address.city}, {CONTACT_INFO.address.country}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className={`h-5 w-5 text-primary mt-0.5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                  <div>
                    <p className="font-medium">{txt.contact.phone}</p>
                    <p className="text-muted-foreground" style={{ direction: 'ltr', textAlign: language === 'ar' ? 'right' : 'left' }}>
                      <a href={`tel:${CONTACT_INFO.phone.primary}`} dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'isolate' }} className="hover:text-primary">{CONTACT_INFO.phone.display.primary}</a><br />
                      <a href={`tel:${CONTACT_INFO.phone.secondary}`} dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'isolate' }} className="hover:text-primary">{CONTACT_INFO.phone.display.secondary}</a>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className={`h-5 w-5 text-primary mt-0.5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                  <div>
                    <p className="font-medium">{txt.contact.email}</p>
                    <p className="text-muted-foreground">
                      <a href={`mailto:${CONTACT_INFO.email.primary}`} className="hover:text-primary">{CONTACT_INFO.email.primary}</a><br />
                      <a href={`mailto:${CONTACT_INFO.email.support}`} className="hover:text-primary">{CONTACT_INFO.email.support}</a>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className={`h-5 w-5 text-primary mt-0.5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                  <div>
                    <p className="font-medium">{txt.contact.hours}</p>
                    <p className="text-muted-foreground">{BUSINESS_HOURS.weekdays}</p>
                    <p className="text-muted-foreground">{BUSINESS_HOURS.weekend}</p>
                    <p className="text-muted-foreground">{BUSINESS_HOURS.closed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
