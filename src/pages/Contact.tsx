import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PublicNavigation from "@/components/PublicNavigation";
import { useSEO } from "@/hooks/useSEO";
import { Mail, ArrowRight, MapPin, Phone, Globe } from "lucide-react";

const Contact = () => {
  useSEO({
    title: 'Contact — CortIQ',
    description: 'Get in touch with the CortIQ team. Request an invitation to our analytics platform or ask about AI agent tracking and cookie-free analytics.',
  });
  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />

      {/* Hero Section */}
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent)] animate-pulse"></div>
        </div>

        <div className="container mx-auto relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-8 animate-fade-in bg-gradient-primary hover-scale hover-glow text-white border-0">
              📧 Get in Touch
            </Badge>
            <h1 className="text-4xl md:text-6xl font-black mb-8 animate-slide-up text-gradient-primary leading-tight">
              Contact Us
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 animate-fade-in leading-relaxed">
              Ready to start measuring AI agents and optimizing your website?
              Get in touch with us at Expandtalk Corporation AB.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Information Section */}
      <section className="py-24 px-4 bg-gradient-subtle">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto">
            <Card className="glass shadow-elegant border-2 border-primary/20">
              <CardHeader className="text-center pb-8">
                <Badge className="mb-4 bg-gradient-accent text-white mx-auto">
                  Expandtalk Corporation AB
                </Badge>
                <CardTitle className="text-3xl md:text-4xl text-gradient-primary">
                  Contact Information
                </CardTitle>
                <CardDescription className="text-lg mt-4">
                  CortIQ is developed by Expandtalk Corporation AB — Your partner in advanced web analytics
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-8">
                {/* Main Contact Person */}
                <div className="text-center py-6 bg-primary/5 rounded-lg">
                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold text-foreground">Daniel Larsson</h3>
                    <p className="text-lg text-muted-foreground">Founder & CEO</p>
                    <p className="text-primary font-semibold">Expandtalk Corporation AB</p>
                  </div>
                </div>

                {/* Contact Methods */}
                <div className="grid md:grid-cols-2 gap-6 py-6">
                  <div className="flex items-start space-x-4 p-4 rounded-lg hover:bg-primary/5 transition-colors">
                    <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center flex-shrink-0">
                      <Globe className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Website</h4>
                      <a
                        href="https://expandtalk.se"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        expandtalk.se
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4 p-4 rounded-lg hover:bg-primary/5 transition-colors">
                    <div className="w-12 h-12 bg-gradient-accent rounded-full flex items-center justify-center flex-shrink-0">
                      <Mail className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Email</h4>
                      <p className="text-muted-foreground text-sm">
                        Available via contact form
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4 p-4 rounded-lg hover:bg-primary/5 transition-colors">
                    <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Location</h4>
                      <p className="text-muted-foreground text-sm">Sweden</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4 p-4 rounded-lg hover:bg-primary/5 transition-colors">
                    <div className="w-12 h-12 bg-gradient-accent rounded-full flex items-center justify-center flex-shrink-0">
                      <Phone className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Response Time</h4>
                      <p className="text-muted-foreground text-sm">Within 24 hours</p>
                    </div>
                  </div>
                </div>

                {/* CTA Button */}
                <div className="pt-6 text-center">
                  <a
                    href="https://expandtalk.se/kontakt/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button className="bg-gradient-primary hover-scale hover-glow text-lg px-8 py-6 h-auto">
                      <Mail className="mr-2 h-5 w-5" />
                      Visit Expandtalk Corporation AB
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>

                  <p className="mt-6 text-sm text-muted-foreground">
                    For inquiries about CortIQ and invite-only access,<br />
                    please reach out through our contact page.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* About CortIQ Section */}
      <section className="py-24 px-4">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">About CortIQ</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              CortIQ is the world's first analytics platform with dedicated AI agent tracking.
              We help businesses understand and optimize for the new agentic web, where AI agents
              like ChatGPT Browser, Perplexity, and Claude are becoming a significant part of web traffic.
            </p>
            <div className="grid md:grid-cols-3 gap-6 mt-12">
              <div className="p-6 rounded-lg bg-primary/5">
                <h3 className="font-semibold mb-2">🤖 AI-First</h3>
                <p className="text-sm text-muted-foreground">
                  First on the market with AI agent analytics
                </p>
              </div>
              <div className="p-6 rounded-lg bg-primary/5">
                <h3 className="font-semibold mb-2">🔒 Privacy-first</h3>
                <p className="text-sm text-muted-foreground">
                  Cookie-free tracking, consent-driven when you go deeper
                </p>
              </div>
              <div className="p-6 rounded-lg bg-primary/5">
                <h3 className="font-semibold mb-2">⚡ Easy Setup</h3>
                <p className="text-sm text-muted-foreground">
                  1-click WordPress plugin installation
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;
