import { Application, Router } from 'oak';
import twilio from 'twilio';

const app = new Application();
const router = new Router();

const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioNumber = Deno.env.get("TWILIO_NUMBER") || "";
const notificationNumber = Deno.env.get("NOTIFICATION_NUMBER") || "";

interface UserRequest {
  name: string;
  email: string;
  message: string;
}

function handleUserRequest(r: URLSearchParams) {
  const twilioClient = twilio(accountSid, authToken);
  const userRequest: UserRequest = {
    name: r.get('name') || '',
    email: r.get('email') || '',
    message: r.get('message')?.slice(0, 1000) || ''
  };
  console.log('Received request: ', userRequest);
  if (!userRequest.name || !userRequest.email || !userRequest.message) {
    console.error('Incomplete request data:', userRequest);
    return;
  }
  if (userRequest.email.match(/\.(ru|cn|in|kr)$/)) {
    console.error('Request contains a blocked email domain:', userRequest.email);
    return;
  }
  if (userRequest.message.match(/(http|https):\/\/[^\s]+\.(ru|cn|in|kr)/)) {
    console.error('Request contains a blocked URL:', userRequest.message);
    return;
  }
  userRequest.message = userRequest.message.replace(/<[^>]+>/g, '').trim(); // Remove HTML tags
  userRequest.message = userRequest.message.replace(/[\r\n]+/g, ' ').trim(); // Normalize newlines
  console.log('Sending notification for request');
  twilioClient.messages.create({
    body: `New request from ${userRequest.name} (${userRequest.email}): ${userRequest.message}`,
    from: twilioNumber,
    to: notificationNumber
  })
}

router.get('/', async (context) => {
  const indexBody = await Deno.readTextFile('./src/views/index.html');
  context.response.body = indexBody;
});

router.post('/request', async (context) => {
  try {
    const form = await context.request.body.form();
    handleUserRequest(form);
    context.response.redirect('/');
  } catch (error) {
    console.error('Error processing request:', error);
    context.response.status = 500;
    context.response.body = 'Internal Server Error';
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

app.use(async (context, next) => {
  const root = "./src/static";
  try {
    await context.send({ root });
  } catch {
    next();
  }
});

app.listen({ port: parseInt(Deno.env.get('PORT') ?? '8000') });
console.log('Server is running on http://localhost:8000');