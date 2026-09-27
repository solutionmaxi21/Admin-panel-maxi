"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/lib/language-context"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Shield, Clock, CheckCircle, AlertCircle, HelpCircle } from "lucide-react"

export default function WarrantyPage() {
  const { language } = useLanguage()

  const content = {
    fr: {
      title: "Politique de Garantie",
      intro: "Tous nos produits sont couverts par une garantie constructeur pour vous protéger en cas de défaut de fabrication.",
      sections: [
        {
          icon: "shield",
          title: "Durée de la Garantie",
          content: "Chaque produit bénéficie d'une garantie allant de 1 à 3 ans selon son type et le constructeur. La durée exacte est indiquée dans les spécifications du produit. La garantie commence à partir de la date d'achat."
        },
        {
          icon: "check",
          title: "Ce qui est Couvert",
          content: "La garantie couvre les défauts de fabrication, les pannes matérielles et les dysfonctionnements dus à des vices cachés. Elle ne couvre PAS les dommages causés par une mauvaise utilisation, les chutes, les dégâts liquides, ou l'usure normale."
        },
        {
          icon: "alert",
          title: "Signalement de Défauts à la Livraison",
          content: "Si vous découvrez un défaut au moment de la réception, signalez-le immédiatement au livreur. Nous procéderons à un échange gratuit : un livreur viendra récupérer l'article défectueux et vous en apportera un neuf, sans frais supplémentaires."
        },
        {
          icon: "clock",
          title: "Comment Utiliser la Garantie",
          content: "Pour faire valoir votre garantie : 1) Signalez le problème dans les délais (dès réception ou rapidement après), 2) Conservez votre facture et vos preuves d'achat, 3) Contactez-nous avec votre numéro de commande et une description du problème. Nous vous aiderons ensuite."
        },
        {
          icon: "help",
          title: "Défauts Post-Livraison",
          content: "Si un défaut apparaît après la période de vérification à la livraison, contactez-nous avec votre facture et une description précise du problème. Nous évaluerons si c'est un défaut couvert par la garantie et procéderons à un échange ou une réparation si applicable."
        },
        {
          icon: "alert",
          title: "Limitation de Garantie",
          content: "La garantie n'est valable que si : le produit a été utilisé normalement, la facture d'achat est fournie, aucune modification n'a été apportée au produit, les défauts ne sont pas dus à des dégâts externes ou une mauvaise manipulation."
        }
      ],
      importantNote: "Important : Conservez toujours votre facture d'achat. Elle est votre preuve d'achat et est indispensable pour faire valoir votre garantie.",
      contactInfo: "Pour des réclamations en garantie, contactez-nous à",
      email: "support@solutionmaxi.com"
    },
    ar: {
      title: "سياسة الضمان",
      intro: "جميع منتجاتنا مشمولة بضمان المصنع لحمايتك في حالة عيوب التصنيع.",
      sections: [
        {
          icon: "shield",
          title: "مدة الضمان",
          content: "كل منتج يستفيد من ضمان يتراوح من 1 إلى 3 سنوات حسب نوعه والمصنع. المدة الدقيقة مذكورة في مواصفات المنتج. يبدأ الضمان من تاريخ الشراء."
        },
        {
          icon: "check",
          title: "ما يغطيه الضمان",
          content: "يغطي الضمان عيوب التصنيع والأعطال المادية والأعطال الناجمة عن العيوب الخفية. لا يغطي الضرر الناجم عن سوء الاستخدام أو السقوط أو تلف السوائل أو البلى العادي."
        },
        {
          icon: "alert",
          title: "الإبلاغ عن العيوب عند التسليم",
          content: "إذا اكتشفت عيب عند الاستلام، أبلغ عنه فورًا لموظف التوصيل. سنقدم استبدالاً مجاني: سيأتي موظف توصيل لاستعادة المنتج المعيب وإحضار منتج جديد، بدون تكاليف إضافية."
        },
        {
          icon: "clock",
          title: "كيفية استخدام الضمان",
          content: "للمطالبة بالضمان: 1) أبلغ عن المشكلة ضمن المواعيد (عند الاستلام أو بسرعة بعده)، 2) احتفظ بفاتورتك وأدلة شرائك، 3) اتصل بنا برقم طلبك ووصف المشكلة. سنساعدك بعد ذلك."
        },
        {
          icon: "help",
          title: "العيوب بعد التسليم",
          content: "إذا ظهر عيب بعد فترة التحقق من التسليم، اتصل بنا مع فاتورتك ووصف دقيق للمشكلة. سنقيم ما إذا كان عيبًا مغطى بالضمان وسنقوم بالاستبدال أو الإصلاح إذا أمكن."
        },
        {
          icon: "alert",
          title: "قيود الضمان",
          content: "الضمان صحيح فقط إذا كان: المنتج قد تم استخدامه بشكل طبيعي، تم تقديم فاتورة الشراء، لم يتم إجراء أي تعديلات على المنتج، العيوب لم تكن بسبب أضرار خارجية أو معالجة خاطئة."
        }
      ],
      importantNote: "مهم: احفظ دائماً فاتورة الشراء الخاصة بك. إنها دليل الشراء الخاص بك وضرورية للمطالبة بالضمان.",
      contactInfo: "لمطالبات الضمان، اتصل بنا على",
      email: "support@solutionmaxi.com"
    }
  }

  const data = content[language === 'ar' ? 'ar' : 'fr']

  const iconMap = {
    shield: <Shield className="h-6 w-6 text-blue-600" />,
    check: <CheckCircle className="h-6 w-6 text-green-600" />,
    alert: <AlertCircle className="h-6 w-6 text-orange-600" />,
    clock: <Clock className="h-6 w-6 text-purple-600" />,
    help: <HelpCircle className="h-6 w-6 text-red-600" />
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

            <Card className="bg-yellow-50 border-yellow-200">
              <CardContent className="py-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-6 w-6 text-yellow-600 shrink-0" />
                  <p className="text-yellow-800">
                    {data.importantNote}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/50 mt-6">
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
