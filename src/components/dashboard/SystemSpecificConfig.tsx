import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Code, 
  Key, 
  Globe, 
  Settings, 
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SystemConfigProps {
  systemType: string;
  onConfigSave: (config: SystemConfig) => void;
}

interface SystemConfig {
  systemType: string;
  apiKey?: string;
  trackingCode?: string;
  formIds?: string[];
  webhookUrl?: string;
  customConfig?: Record<string, any>;
}

const systemConfigs = {
  hubspot: {
    name: 'HubSpot',
    fields: {
      portalId: { label: 'Portal ID', type: 'text', required: true, placeholder: '12345678' },
      apiKey: { label: 'API Key', type: 'password', required: true, placeholder: 'pat-eu1-...' },
      formId: { label: 'Form ID', type: 'text', required: false, placeholder: 'form-guid-here' },
      trackingCode: { label: 'Tracking Code', type: 'textarea', required: false, placeholder: 'HubSpot tracking script' }
    },
    instructions: [
      'Go to HubSpot Settings → Integrations → API key',
      'Copy your Private App token or API key',
      'Find your Portal ID in Account & Defaults',
      'For forms: go to Marketing → Forms and copy the Form ID'
    ],
    webhookExample: 'https://your-site.com/api/hubspot-webhook'
  },
  salesforce: {
    name: 'Salesforce',
    fields: {
      orgId: { label: 'Organization ID', type: 'text', required: true, placeholder: '00D...' },
      apiKey: { label: 'API Key/Token', type: 'password', required: true, placeholder: 'Session ID or OAuth token' },
      instanceUrl: { label: 'Instance URL', type: 'text', required: true, placeholder: 'https://yourorg.salesforce.com' },
      webToLeadUrl: { label: 'Web-to-Lead URL', type: 'text', required: false, placeholder: 'https://webto.salesforce.com/servlet/servlet.WebToLead' }
    },
    instructions: [
      'Log in to Salesforce Setup',
      'Go to Platform Tools → Objects and Fields → Object Manager',
      'For Web-to-Lead: Setup → Feature Settings → Marketing → Web-to-Lead',
      'For API: Apps → App Manager → New Connected App'
    ],
    webhookExample: 'https://your-site.com/api/salesforce-webhook'
  },
  eloqua: {
    name: 'Oracle Eloqua',
    fields: {
      siteName: { label: 'Site Name', type: 'text', required: true, placeholder: 'YourCompany' },
      username: { label: 'Username', type: 'text', required: true, placeholder: 'user@company.com' },
      password: { label: 'Password', type: 'password', required: true, placeholder: 'API password' },
      baseUrl: { label: 'Base URL', type: 'text', required: true, placeholder: 'https://secure.p01.eloqua.com' },
      formId: { label: 'Form ID', type: 'text', required: false, placeholder: 'Form ID from Eloqua' }
    },
    instructions: [
      'Go to Eloqua Administration',
      'Security → Users → select your user',
      'Create API credentials under Security Settings',
      'Find your Base URL in System Settings'
    ],
    webhookExample: 'https://your-site.com/api/eloqua-webhook'
  },
  sentrisk: {
    name: 'SentriSK',
    fields: {
      formIds: { label: 'SentriSK form IDs', type: 'textarea', required: false, placeholder: 'Optional: form UUIDs, one per line (found automatically when left empty)' }
    },
    instructions: [
      'Embed the form with the SentriSK WordPress plugin ([sentrisk_form id="..."]), the SentriSK block, or sentrisk-embed.js',
      'Install the CortIQ tracking script (5.5.4 or later) or the CortIQ WordPress plugin on the same pages',
      'No API key is needed: the SentriSK form reports each submission to the CortIQ tracker on the page, which records it as a form conversion',
      'Forms are discovered automatically under Conversion Goals; give them a label there',
      'Field-level drop-off is not available: the form runs in a SentriSK iframe, so CortIQ sees submissions, not individual fields'
    ],
    webhookExample: 'https://www.sentrisk.se/embed/<form-id>'
  },
  contact_form_7: {
    name: 'Contact Form 7',
    fields: {
      formId: { label: 'Form ID', type: 'text', required: true, placeholder: 'contact-form-1' },
      formTitle: { label: 'Form Title', type: 'text', required: false, placeholder: 'Contact form' },
      mailTags: { label: 'Mail Tags', type: 'textarea', required: false, placeholder: '[your-name], [your-email], [your-message]' },
      customCss: { label: 'Custom CSS Class', type: 'text', required: false, placeholder: 'custom-form-class' }
    },
    instructions: [
      'Go to WordPress Admin → Contact → Contact Forms',
      'Select the form you want to track',
      'Copy the shortcode ID (e.g. id="123")',
      'Note the mail tags for lead tracking'
    ],
    webhookExample: 'https://your-site.com/wp-json/contact-form-7/v1/contact-forms'
  },
  gravity_forms: {
    name: 'Gravity Forms',
    fields: {
      formId: { label: 'Form ID', type: 'text', required: true, placeholder: '1' },
      apiKey: { label: 'API Key', type: 'password', required: false, placeholder: 'Gravity Forms API key' },
      webhookUrl: { label: 'Webhook URL', type: 'text', required: false, placeholder: 'https://your-site.com/gf-webhook' },
      notificationIds: { label: 'Notification IDs', type: 'text', required: false, placeholder: '1,2,3 (comma-separated)' }
    },
    instructions: [
      'Go to WordPress Admin → Forms',
      'Select the form and note the ID',
      'For API: Forms → Settings → REST API',
      'For webhooks: Form Settings → Notifications'
    ],
    webhookExample: 'https://your-site.com/wp-json/gf/v2/forms/{formId}/entries'
  }
};

export function SystemSpecificConfig({ systemType, onConfigSave }: SystemConfigProps) {
  const [config, setConfig] = useState<SystemConfig>({ systemType });
  const [activeTab, setActiveTab] = useState('config');
  const { toast } = useToast();
  
  const systemConfig = systemConfigs[systemType as keyof typeof systemConfigs];
  
  if (!systemConfig) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Unknown system</h3>
          <p className="text-muted-foreground">System type "{systemType}" is not supported yet.</p>
        </CardContent>
      </Card>
    );
  }

  const handleFieldChange = (fieldName: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      customConfig: {
        ...prev.customConfig,
        [fieldName]: value
      }
    }));
  };

  const handleSave = () => {
    // Validera required fields
    const requiredFields = Object.entries(systemConfig.fields)
      .filter(([_, field]) => field.required)
      .map(([name, _]) => name);
    
    const missingFields = requiredFields.filter(field => 
      !config.customConfig?.[field] || config.customConfig[field].trim() === ''
    );
    
    if (missingFields.length > 0) {
      toast({
        title: "Missing fields",
        description: `The following fields must be filled in: ${missingFields.join(', ')}`,
        variant: "destructive"
      });
      return;
    }

    onConfigSave(config);
    toast({
      title: "Configuration saved",
      description: `${systemConfig.name} has been configured successfully`,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Text has been copied to clipboard",
    });
  };

  const generateTrackingScript = () => {
    switch (systemType) {
      case 'hubspot':
        return `<!-- HubSpot Tracking Code -->
<script type="text/javascript" id="hs-script-loader" async defer src="//js.hs-scripts.com/${config.customConfig?.portalId}.js"></script>

<!-- HubSpot Form Embed -->
<script charset="utf-8" type="text/javascript" src="//js.hsforms.net/forms/v2.js"></script>
<script>
  hbspt.forms.create({
    region: "eu1",
    portalId: "${config.customConfig?.portalId}",
    formId: "${config.customConfig?.formId}"
  });
</script>`;

      case 'salesforce':
        return `<!-- Salesforce Web-to-Lead -->
<form action="${config.customConfig?.webToLeadUrl}" method="POST">
  <input type="hidden" name="oid" value="${config.customConfig?.orgId}">
  <input type="hidden" name="retURL" value="https://your-site.com/thank-you">
  
  <!-- Add your form fields here -->
  <input type="text" name="first_name" placeholder="First name" required>
  <input type="text" name="last_name" placeholder="Last name" required>
  <input type="email" name="email" placeholder="Email" required>

  <input type="submit" value="Submit">
</form>`;

      case 'contact_form_7':
        return `<!-- Contact Form 7 Shortcode -->
[contact-form-7 id="${config.customConfig?.formId}" title="${config.customConfig?.formTitle || 'Contact form'}"]

<!-- For tracking, add to functions.php -->
add_action('wpcf7_mail_sent', function($contact_form) {
    // Send data to analytics
    $form_id = $contact_form->id();
    // Add your tracking code here
});`;

      default:
        return `<!-- ${systemConfig.name} integration code will be generated based on your configuration -->`;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">{systemConfig.name} Configuration</h2>
          <p className="text-muted-foreground">
            Configure your {systemConfig.name} integration for form tracking
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="instructions">Instructions</TabsTrigger>
          <TabsTrigger value="code">Tracking Code</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API & Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(systemConfig.fields).map(([fieldName, field]) => (
                <div key={fieldName}>
                  <Label htmlFor={fieldName} className="flex items-center gap-2">
                    {field.label}
                    {field.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                  </Label>
                  {field.type === 'textarea' ? (
                    <Textarea
                      id={fieldName}
                      placeholder={field.placeholder}
                      value={config.customConfig?.[fieldName] || ''}
                      onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                      className="mt-1"
                    />
                  ) : (
                    <Input
                      id={fieldName}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={config.customConfig?.[fieldName] || ''}
                      onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                      className="mt-1"
                    />
                  )}
                </div>
              ))}
              
              <div className="pt-4">
                <Button onClick={handleSave} className="w-full">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Save Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instructions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Step-by-step Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {systemConfig.instructions.map((instruction, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">{index + 1}</Badge>
                    <p className="text-sm">{instruction}</p>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Webhook URL (optional)</h4>
                <div className="flex items-center gap-2">
                  <Input 
                    value={systemConfig.webhookExample} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(systemConfig.webhookExample)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Use this URL to receive webhooks from {systemConfig.name}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="code" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Generated Tracking Code
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                    <code>{generateTrackingScript()}</code>
                  </pre>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(generateTrackingScript())}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>The code is generated based on your configuration. Fill in the API information first.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}