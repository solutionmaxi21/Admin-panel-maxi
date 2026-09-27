"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/lib/language-context"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { AlertCircle, CheckCircle, Clock } from "lucide-react"

export default function ReturnsRefundsPage() {
  const { language } = useLanguage()

  const content = {
    fr: {
      title: "Politique de Retours & Remboursements",
      intro: "Chez Solutionmaxi, nous voulons que vous soyez entièrement satisfait de votre achat. Découvrez nos conditions de retour et de remboursement ci-dessous.",
      sections: [
        {
          icon: "check",
          title: "À la Réception du Produit",
          content: "Lorsque vous recevez votre commande, vous avez le droit de vérifier le produit directement avec le livreur avant d'accepter le colis. Vérifiez que c'est le bon produit, que l'emballage n'est pas endommagé et que le contenu est intact. C'est votre opportunité d'inspecter le matériel pour tout dommage ou défaut."
        },
        {
          icon: "alert",
          title: "Signalement Immédiat des Problèmes",
          content: "Si vous découvrez une erreur (produit incorrect, mauvaise référence) ou un défaut de qualité, vous devez le signaler immédiatement au livreur. Important : vous ne pouvez pas vous éloigner du livreur avec le colis avant de l'avoir vérifié et payé."
        },
        {
          icon: "check",
          title: "Processus d'Échange Gratuit",
          content: "Si le problème provient de notre part ou si le produit a un défaut de fabrication, nous vous offrons un échange gratuit. Un livreur reviendra vous récupérer l'article défectueux et vous apportera le produit correct - complètement gratuit, frais de livraison inclus."
        },
        {
          icon: "alert",
          title: "Si l'Erreur Vient de Vous",
          content: "Si vous avez commandé le mauvais produit par erreur ou si vous n'êtes finalement pas satisfait du choix, vous pouvez toujours demander un échange ou un retour. Cependant, les frais de livraison pour ce type de retour seront à votre charge, et le produit doit être dans son état d'origine, non utilisé ou endommagé par vous."
        },
        {
          icon: "clock",
          title: "Remboursements",
          content: "Les remboursements sont traités après approbation du retour par notre équipe. Si votre produit arrive gravement endommagé et ne peut être réparé, nous procéderons à un remboursement complet du prix d'achat. Les remboursements sont généralement traités dans les 7-10 jours ouvrables."
        },
        {
          icon: "alert",
          title: "Conditions Non Couvertes",
          content: "Les retours ne sont pas acceptés pour : les produits ouverts et utilisés (sauf défaut de fabrication), les produits endommagés ou modifiés par une mauvaise utilisation, les accessoires manquants après démontage ou utilisation, les produits avec signes évidents d'usage ou de test."
        }
      ],
      contactInfo: "Pour toute question concernant les retours ou les remboursements, contactez-nous à",
      email: "support@solutionmaxi.com"
    },
    ar: {
      title: "سياسة الإرجاع والاسترجاع",
      intro: "في Solutionmaxi، نريد أن تكون راضياً تماماً عن عملية الشراء. اكتشف شروط الإرجاع والاسترجاع أدناه.",
      sections: [
        {
          icon: "check",
          title: "عند استلام المنتج",
          content: "عندما تستقبل طلبك، لديك الحق في التحقق من المنتج مباشرة مع موظف التوصيل قبل قبول الطرد. تحقق من أنه المنتج الصحيح، وأن الصندوق غير تالف، وأن المحتويات سليمة. هذه فرصتك للتحقق من الأجهزة بحثاً عن أي ضرر أو عيب."
        },
        {
          icon: "alert",
          title: "الإبلاغ الفوري عن المشاكل",
          content: "إذا اكتشفت خطأ (منتج خاطئ، مرجع خاطئ) أو عيب في الجودة، يجب عليك الإبلاغ عنه فورًا لموظف التوصيل. مهم: لا يمكنك الابتعاد عن موظف التوصيل بالطرد قبل التحقق منه والدفع."
        },
        {
          icon: "check",
          title: "عملية الاستبدال المجاني",
          content: "إذا كانت المشكلة من جانبنا أو كان المنتج به عيب في التصنيع، نقدم لك استبدال مجاني. سيعود موظف توصيل لاستعادة المنتج التالف وإحضار المنتج الصحيح - بالكامل مجاني، بما في ذلك رسوم التوصيل."
        },
        {
          icon: "alert",
          title: "إذا كان الخطأ من جانبك",
          content: "إذا طلبت المنتج الخاطئ بالخطأ أو إذا لم تكن راضياً في النهاية عن الاختيار، يمكنك طلب استبدال أو إرجاع. ومع ذلك، ستكون رسوم التوصيل لهذا النوع من الإرجاع على عاتقك، ويجب أن يكون المنتج في حالته الأصلية، غير مستخدم أو تالف من قبلك."
        },
        {
          icon: "clock",
          title: "المستردات",
          content: "يتم معالجة المستردات بعد موافقة فريقنا على الإرجاع. إذا وصل المنتج الخاص بك تالفاً بشدة ولا يمكن إصلاحه، سنقوم برد كامل سعر الشراء. عادةً ما تتم معالجة المستردات في غضون 7-10 أيام عمل."
        },
        {
          icon: "alert",
          title: "الشروط غير المغطاة",
          content: "لا يتم قبول الإرجاع للمنتجات التالية: المنتجات المفتوحة والمستخدمة (ما لم يكن هناك عيب صناعي)، المنتجات التالفة أو المعدلة بسبب سوء الاستخدام، الملحقات المفقودة بعد الفك أو الاستخدام، المنتجات التي تظهر عليها علامات واضحة من الاستخدام أو الاختبار."
        }
      ],
      contactInfo: "للاستفسارات حول الإرجاع أو المستردات، اتصل بنا على",
      email: "support@solutionmaxi.com"
    }
  }

  const data = content[language === 'ar' ? 'ar' : 'fr']

  const iconMap = {
    check: <CheckCircle className="h-6 w-6 text-green-600" />,
    alert: <AlertCircle className="h-6 w-6 text-blue-600" />,
    clock: <Clock className="h-6 w-6 text-orange-600" />
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
