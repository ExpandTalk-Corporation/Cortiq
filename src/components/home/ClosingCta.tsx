import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Bot, BarChart3 } from "lucide-react";

export function ClosingCta() {
  return (
    <section className="py-20 px-4 bg-gradient-primary text-white">
      <div className="container mx-auto max-w-3xl text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Know what kind of traffic you have</h2>
        <p className="text-lg opacity-95 mb-8">
          CortIQ is free during beta. Create an account and add your site, or ask Expandtalk Corporation AB a question first.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/auth">
            <Button size="lg" variant="secondary" className="group">
              <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
              Create free account
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform motion-reduce:transition-none" />
            </Button>
          </Link>
          <Link to="/contact/">
            <Button size="lg" variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white">
              <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
              Contact us
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
