export default {
  name: 'Variable Translation',
  id: '1620225196088126140',
  api: '1.0.0',
  documentAccess: 'dynamic-page',
  main: 'src/main/main.ts',
  ui: 'src/ui/ui.tsx',
  editorType: ['figma'],
  networkAccess: {
    allowedDomains: [
      'https://api.openai.com',
      'https://*.vercel.app',
    ],
  },
};
