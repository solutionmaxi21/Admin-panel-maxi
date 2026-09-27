"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/lib/language-context"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Truck, Clock, MapPin, DollarSign, Phone } from "lucide-react"

export default function ShippingInfoPage() {
  const { language } = useLanguage()

  const content = {
    fr: {
      title: "Informations de Livraison",
      intro: "Découvrez comment nous livrons vos produits à travers l'Algérie avec rapidité et sécurité.",
      sections: [
        {
          icon: "truck",
          title: "Nos Partenaires de Livraison",
          content: "Nous travaillons avec les plus grands partenaires de logistique en Algérie, notamment Guepex et Yalidine. Ces prestataires assurent une livraison rapide et fiable à travers les 58 wilayas du pays."
        },
        {
          icon: "map",
          title: "Couverture Nationale",
          content: "Nous livrons dans l'ensemble des 58 wilayas d'Algérie. Que vous soyez en zone urbaine ou rurale, nous assurons une livraison à votre porte. Les zones reculées peuvent connaître des délais légèrement plus longs."
        },
        {
          icon: "clock",
          title: "Délais de Livraison Estimés",
          content: "Les délais varient selon votre localisation : Alger (1-2 jours ouvrables), Grandes villes (2-4 jours ouvrables), Autres régions (3-7 jours ouvrables). Ces délais commencent après confirmation de paiement et peuvent être affectés par les conditions météorologiques ou d'autres facteurs externes."
        },
        {
          icon: "dollar",
          title: "Frais de Livraison",
          content: "Livraison gratuite pour toutes les commandes supérieures à 50 000 DZD. Pour les commandes inférieures, des frais de livraison standard de 2 000 DZD s'appliquent. Vous avez également la possibilité de retirer votre commande en point de retrait pour une tarification réduite."
        },
        {
          icon: "track",
          title: "Suivi de Colis",
          content: "Une fois votre commande expédiée, vous recevrez un lien de suivi vous permettant de suivre votre colis en temps réel. Vous verrez la localisation actuelle du colis et l'heure estimée de livraison. Le livreur vous contactera aussi avant l'arrivée."
        },
        {
          icon: "phone",
          title: "Vérification à la Livraison",
          content: "À la réception, vous pouvez vérifier complètement le produit avec le livreur avant d'accepter et de payer. Ne vous éloignez pas avec le colis avant cette vérification. C'est important pour votre protection."
        }
      ],
      contactInfo: "Pour des questions sur votre livraison, contactez-nous à",
      email: "support@solutionmaxi.com"
    },
    ar: {
      title: "معلومات التوصيل",
      intro: "اكتشف كيفية توصيل منتجاتك عبر الجزائر بسرعة وأمان.",
      sections: [
        {
          icon: "truck",
          title: "شركاؤنا في التوصيل",
          content: "نعمل مع أكبر شركات الخدمات اللوجستية في الجزائر، وخاصة Guepex و Yalidine. توفر هذه الشركات تسليمًا سريعًا وموثوقًا عبر جميع الولايات الـ 58 في البلاد."
        },
        {
          icon: "map",
          title: "التغطية الوطنية",
          content: "نحن نوصل إلى جميع الولايات الـ 58 في الجزائر. سواء كنت في منطقة حضرية أو ريفية، نضمن التسليم إلى باب منزلك. قد تستغرق المناطق النائية وقتًا أطول قليلاً."
        },
        {
          icon: "clock",
          title: "مواعيد التسليم المقدرة",
          content: "تختلف المواعيد حسب موقعك: الجزائر العاصمة (1-2 يوم عمل)، المدن الكبرى (2-4 أيام عمل)، مناطق أخرى (3-7 أيام عمل). تبدأ هذه المواعيد بعد تأكيد الدفع وقد تتأثر بالظروف الجوية أو عوامل خارجية أخرى."
        },
        {
          icon: "dollar",
          title: "رسوم التوصيل",
          content: "التسليم مجاني لجميع الطلبات التي تزيد عن 50,000 دج. للطلبات الأقل من ذلك، تطبق رسوم توصيل قياسية قدرها 2,000 دج. لديك أيضًا خيار استلام طلبك من نقطة التسليم برسوم مخفضة."
        },
        {
          icon: "track",
          title: "تتبع الطرود",
          content: "بعد شحن طلبك، ستتلقى رابط تتبع يسمح لك بمتابعة الطرد في الوقت الفعلي. ستشاهد الموقع الحالي للطرد والوقت المتوقع للتسليم. سيتصل بك الموظف أيضًا قبل الوصول."
        },
        {
          icon: "phone",
          title: "التحقق عند التسليم",
          content: "عند الاستلام، يمكنك التحقق بالكامل من المنتج مع موظف التوصيل قبل القبول والدفع. لا تبتعد بالطرد قبل هذا التحقق. هذا مهم لحمايتك."
        }
      ],
      contactInfo: "للاستفسارات عن التوصيل، اتصل بنا على",
      email: "support@solutionmaxi.com"
    }
  }

  const data = content[language === 'ar' ? 'ar' : 'fr']

  const iconMap = {
    truck: <Truck className="h-6 w-6 text-blue-600" />,
    map: <MapPin className="h-6 w-6 text-green-600" />,
    clock: <Clock className="h-6 w-6 text-orange-600" />,
    dollar: <DollarSign className="h-6 w-6 text-purple-600" />,
    track: <Truck className="h-6 w-6 text-indigo-600" />,
    phone: <Phone className="h-6 w-6 text-red-600" />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-4">{data.title}</h1>
            <p className="text-lg text-muted-foreground mb-12">
              {data.intro}
            </p>

            <div className="space-y-6 mb-12">
              {data.sections.map((section, index) => (
                <Card key={index} className="border-l-4 border-l-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      {iconMap[section.icon as keyof typeof iconMap]}
                      {section.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{section.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-muted/50">
              <CardContent className="py-6">
                <p className="text-center text-muted-foreground">
                  {data.contactInfo}{' '}
                  <a href={`mailto:${data.email}`} className="text-primary hover:underline font-medium">
                    {data.email}
                  </a>
                </p>
              </CardContent>
            </Card>

            <div className="mt-8 text-center">
              <Link href="/faq" className="text-primary hover:underline">
                {language === 'ar' ? '← العودة إلى الأسئلة الشائعة' : '← Retour aux questions fréquentes'}
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
