
import React, { useState, useRef } from 'react';
import Icon from './Icon';

interface LoginPageProps {
  onLogin: () => void;
}

const PlanCard: React.FC<{ title: string; price: string; features: string[]; popular?: boolean }> = ({ title, price, features, popular }) => (
    <div className={`p-6 rounded-lg border ${popular ? 'border-blue-500 bg-blue-50' : 'bg-white border-black/20'} relative h-full flex flex-col`}>
        {popular && <div className="absolute top-0 right-6 -translate-y-1/2 bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">MOST POPULAR</div>}
        <h3 className="text-lg font-semibold text-black">{title}</h3>
        <p className="mt-2 text-3xl font-bold text-black">{price}<span className="text-sm font-medium text-black/70">{price.startsWith('₹') ? '/mo' : ''}</span></p>
        <p className="text-sm text-black/70 mt-1">{
            title === 'Free' ? 'To get you started.' :
            title === 'Starter' ? 'For individuals and small teams.' :
            title === 'Pro' ? 'For growing businesses.' : 'For large enterprises.'
        }</p>
        <ul className="mt-6 space-y-3 text-sm text-black/80 flex-grow">
            {features.map((feature, i) => (
                <li key={i} className="flex items-start space-x-2">
                    <Icon name="check-circle" className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                </li>
            ))}
        </ul>
        <button className={`mt-8 w-full py-2 rounded-md font-semibold text-sm ${popular ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'}`}>
            Choose Plan
        </button>
    </div>
);


const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(true);
  
  // Sign In State
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password');
  
  // Sign Up State
  const [email, setEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Password visibility state
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Simple hardcoded credentials for demo purposes
    if (username === 'admin' && password === 'password') {
      onLogin();
    } else {
      setError('Invalid username or password.');
    }
  };

  const handleSignUp = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setSuccess('');
      if (newPassword !== confirmPassword) {
          setError("Passwords do not match.");
          return;
      }
      if (newPassword.length < 8) {
          setError("Password must be at least 8 characters long.");
          return;
      }
      // In a real app, you would register the user here.
      // For this demo, we'll just show a success message and switch to sign in.
      console.log('Signed up with:', { email, newUsername, companyName, logo: logo?.name });
      setSuccess('Account created successfully! Please sign in.');
      setIsSignUp(false);
      // Pre-fill username for convenience
      setUsername(newUsername);
      setPassword('');
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setLogo(file);
      setError('');
    } else {
      setLogo(null);
      if (file) {
        setError('Please select a valid image file (e.g., JPG, PNG).');
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 p-4">
      <div className="w-full max-w-7xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        
        {/* Top Side - Form */}
        <div className="p-8 lg:p-12">
          <div className="max-w-md mx-auto">
            <div>
              <h1 className="text-3xl font-bold text-center text-blue-600">AI-Accounting</h1>
              {isSignUp && <h2 className="mt-4 text-2xl font-bold text-center text-black">Registration</h2>}
              <p className="mt-2 text-center text-sm text-black/70">
                {isSignUp ? 'Create your new account' : 'Sign in to your account'}
              </p>
            </div>
            
            <form className="mt-8 space-y-6" onSubmit={isSignUp ? handleSignUp : handleSignIn}>
              {isSignUp ? (
                  <>
                      <div>
                          <label htmlFor="company-name" className="sr-only">Company Name</label>
                          <input id="company-name" name="company-name" type="text" required className="appearance-none relative block w-full px-3 py-2 border border-black/20 placeholder-black/50 text-black bg-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                      </div>
                      <div>
                          <label htmlFor="email" className="sr-only">Email address</label>
                          <input id="email" name="email" type="email" autoComplete="email" required className="appearance-none relative block w-full px-3 py-2 border border-black/20 placeholder-black/50 text-black bg-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                      <div>
                          <label htmlFor="new-username" className="sr-only">Username</label>
                          <input id="new-username" name="new-username" type="text" autoComplete="username" required className="appearance-none relative block w-full px-3 py-2 border border-black/20 placeholder-black/50 text-black bg-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                      </div>
                      <div className="relative">
                          <label htmlFor="new-password"className="sr-only">Password</label>
                          <input id="new-password" name="new-password" type={isPasswordVisible ? 'text' : 'password'} autoComplete="new-password" required className="appearance-none relative block w-full px-3 py-2 border border-black/20 placeholder-black/50 text-black bg-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm pr-10" placeholder="Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                          <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600" aria-label={isPasswordVisible ? "Hide password" : "Show password"}>
                            <Icon name={isPasswordVisible ? 'eye-slash' : 'eye'} className="w-5 h-5" />
                          </button>
                      </div>
                      <div className="relative">
                          <label htmlFor="confirm-password"className="sr-only">Confirm Password</label>
                          <input id="confirm-password" name="confirm-password" type={isConfirmPasswordVisible ? 'text' : 'password'} autoComplete="new-password" required className="appearance-none relative block w-full px-3 py-2 border border-black/20 placeholder-black/50 text-black bg-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm pr-10" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                          <button type="button" onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600" aria-label={isConfirmPasswordVisible ? "Hide password" : "Show password"}>
                            <Icon name={isConfirmPasswordVisible ? 'eye-slash' : 'eye'} className="w-5 h-5" />
                          </button>
                      </div>
                      <div>
                        <input type="file" ref={logoInputRef} onChange={handleLogoChange} accept="image/*" className="hidden" id="logo-upload" />
                        <label htmlFor="logo-upload" className="cursor-pointer flex items-center justify-center w-full px-4 py-2 border border-blue-600 text-sm font-medium rounded-md text-blue-600 bg-white hover:bg-blue-50">
                            <Icon name="upload" className="w-5 h-5 mr-2" />
                            <span className="truncate">{logo ? `Logo: ${logo.name}` : 'Upload Logo'}</span>
                        </label>
                      </div>
                  </>
              ) : (
                  <>
                    <div>
                      <label htmlFor="username" className="sr-only">Username</label>
                      <input id="username" name="username" type="text" autoComplete="username" required className="appearance-none relative block w-full px-3 py-2 border border-black/20 placeholder-black/50 text-black bg-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Username (use 'admin')" value={username} onChange={(e) => setUsername(e.target.value)} />
                    </div>
                    <div className="relative">
                      <label htmlFor="password"className="sr-only">Password</label>
                      <input id="password" name="password" type={isPasswordVisible ? 'text' : 'password'} autoComplete="current-password" required className="appearance-none relative block w-full px-3 py-2 border border-black/20 placeholder-black/50 text-black bg-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm pr-10" placeholder="Password (use 'password')" value={password} onChange={(e) => setPassword(e.target.value)} />
                       <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600" aria-label={isPasswordVisible ? "Hide password" : "Show password"}>
                        <Icon name={isPasswordVisible ? 'eye-slash' : 'eye'} className="w-5 h-5" />
                      </button>
                    </div>
                  </>
              )}
              
              {error && <p className="text-xs text-red-600 text-center">{error}</p>}
              {success && <p className="text-xs text-green-600 text-center">{success}</p>}

              <div>
                <button type="submit" className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </button>
              </div>

              <div className="text-center text-sm">
                  <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess(''); }} className="font-medium text-blue-600 hover:text-blue-500">
                      {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                  </button>
              </div>
            </form>
          </div>
        </div>

        {/* Bottom Side - Plans */}
        <div className="p-8 lg:p-12 bg-white border-t border-black/10">
            <h2 className="text-2xl font-bold text-black text-center">Choose Your Plan</h2>
            <p className="mt-2 text-black/70 text-center">Start your journey with a plan that fits your needs.</p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <PlanCard 
                    title="Free" 
                    price="₹0"
                    features={['20 Vouchers/mo', 'Manual Entry Only', 'Basic Reports', '1 User']}
                />
                <PlanCard 
                    title="Starter" 
                    price="₹1,200"
                    features={['500 Vouchers/mo', 'AI Invoice Extraction (50/mo)', 'All Reports & GST', 'Stock Management', 'Community Support']}
                    popular={true}
                />
                <PlanCard 
                    title="Pro" 
                    price="₹5,000"
                    features={['Unlimited Vouchers', 'AI Invoice Extraction (500/mo)', 'AI Accounting Assistant', 'Multi-user Access', 'Priority Phone Support']}
                />
            </div>
        </div>

      </div>
    </div>
  );
};

export default LoginPage;