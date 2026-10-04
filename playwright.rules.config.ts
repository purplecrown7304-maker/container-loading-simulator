import config from './playwright.config';
export default {...config, workers:1, use:{...config.use,baseURL:'http://127.0.0.1:4181'},webServer:undefined};
