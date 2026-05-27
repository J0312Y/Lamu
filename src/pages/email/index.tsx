import { PageLayout } from "@/layouts";
import { EmailSettings } from "@/pages/app/components/email/EmailSettings";

const EmailPage = () => {
  return (
    <PageLayout
      title="Email"
      description="Configurez votre SMTP et vos contacts pour envoyer des emails par commande vocale."
    >
      <EmailSettings />
    </PageLayout>
  );
};

export default EmailPage;
