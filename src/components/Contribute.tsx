import { Button, Card, CardContent, CardDescription, CardTitle } from "./ui";

const Contribute = () => {
  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-4 p-4 py-0 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 md:max-w-[70%]">
          <CardTitle className="text-xs lg:text-sm">
            Contribuez à Lamu, obtenez un accès à vie
          </CardTitle>
          <CardDescription className="text-[10px] lg:text-xs">
            Corrigez un problème critique listé et gagnez une licence Dev Pro à vie.
            Contactez-nous à support@lamuka-tech.com pour en savoir plus.
          </CardDescription>
        </div>
        <Button asChild className="w-full md:w-auto text-[10px] lg:text-xs">
          <a
            href="mailto:support@lamuka-tech.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            Nous contacter
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};

export default Contribute;
