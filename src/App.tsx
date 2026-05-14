import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Upload, 
  History, 
  User as UserIcon, 
  LogOut, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  Image as ImageIcon,
  Loader2,
  Trash2,
  ArrowRight,
  Menu,
  X,
  Download
} from 'lucide-react';
import imgGovernance from './assets/images/regenerated_image_1778299843914.jpg';
import imgAudit from './assets/images/regenerated_image_1778299845464.jpg';
import imgAnalysis from './assets/images/regenerated_image_1778299846931.jpg';
import { auth, signInWithGoogle, signInWithGoogleRedirect, handleRedirectResult } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ensureUserProfile, getHistory, saveRecord, deleteRecord, getAllUsers, updateUserTier, getAppSettings, updateAppSettings, GlobalSettings, UserProfile, uploadFile } from './services/dataService';
import { analyzeImage, AnalysisResult } from './services/aiService';
import { cn, formatDate } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Types ---
type View = 'hero' | 'dashboard' | 'history' | 'analyze' | 'admin';

// --- Components ---

const Button = ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, onClick, ...props }: any) => {
  const variants: any = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20',
    secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50',
    outline: 'bg-transparent text-gray-400 border border-gray-800 hover:border-gray-700 hover:text-white',
    danger: 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20',
    ghost: 'bg-transparent text-gray-400 hover:text-white hover:bg-white/5'
  };
  const sizes: any = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base font-medium'
  };
  return (
    <button 
      type="button"
      disabled={loading || disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
};

const Card = ({ children, className }: any) => (
  <div className={cn('bg-[#0A0B10] border border-gray-800 rounded-xl overflow-hidden card-print', className)}>
    {children}
  </div>
);

const LocalizationMap = ({ image, regions }: { image: string, regions?: AnalysisResult['manipulatedRegions'] }) => {
  return (
    <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
      <img src={image} className="w-full h-full object-contain" alt="Analyzed" referrerPolicy="no-referrer" />
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none" 
        viewBox="0 0 1000 1000" 
        preserveAspectRatio="none"
      >
        {regions?.map((region, idx) => {
          const [ymin, xmin, ymax, xmax] = region.box_2d;
          return (
            <g key={idx}>
              <rect
                x={xmin}
                y={ymin}
                width={xmax - xmin}
                height={ymax - ymin}
                fill="rgba(239, 68, 68, 0.2)"
                stroke="#EF4444" 
                strokeWidth="4"
              />
              <text
                x={xmin}
                y={ymin > 40 ? ymin - 10 : ymin + 25}
                fill="#EF4444"
                fontSize="24"
                fontWeight="bold"
                className="drop-shadow-md"
              >
                {region.label}
              </text>
            </g>
          );
        })}
      </svg>
      {(!regions || regions.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
           <p className="text-gray-400 text-sm font-medium italic">No localized manipulations detected visually.</p>
        </div>
      )}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [view, setView] = useState<View>('hero');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [activeResult, setActiveResult] = useState<AnalysisResult | null>(null);
  const [uploadedBase64, setUploadedBase64] = useState<string | null>(null);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [appSettings, setAppSettings] = useState<GlobalSettings | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [selectedAdminUser, setSelectedAdminUser] = useState<UserProfile | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view === 'admin' && profile?.isAdmin) {
      loadAdminData();
    }
  }, [view, profile]);

  const loadAdminData = async () => {
    setIsAdminLoading(true);
    try {
      const [users, settings] = await Promise.all([
        getAllUsers(),
        getAppSettings()
      ]);
      setAllUsers(users);
      setAppSettings(settings);
    } catch (err) {
      console.error("Failed to load admin data", err);
    } finally {
      setIsAdminLoading(false);
    }
  };

  useEffect(() => {
    // Load global settings for everyone immediately
    const loadSettings = async () => {
      try {
        const settings = await getAppSettings();
        setAppSettings(settings);
        
        // Handle redirect result if any
        const result = await handleRedirectResult();
        if (result) {
          console.log('Redirect login success:', result.user.email);
        }
      } catch (e) {
        console.error("Failed to load global settings or handle redirect", e);
      }
    };
    loadSettings();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u) {
        const p = await ensureUserProfile(u);
        // Force isAdmin locally for bootstrap user to ensure immediate UI visibility
        if (u.email === 'abhishekkashyap.iitd@gmail.com') {
          p.isAdmin = true;
        }
        setProfile(p);
        const h = await getHistory(u.uid);
        setHistory(h);
        if (view === 'hero') setView('dashboard');
      } else {
        setView('hero');
        setProfile(null);
      }
    });
    return unsubscribe;
  }, []);

  const [isLoginLoading, setIsLoginLoading] = useState(false);

  const handleLogin = async () => {
    console.log('Handle login triggered');
    setIsLoginLoading(true);
    try {
      console.log('Attempting login via popup...');
      await signInWithGoogle();
      console.log('Login successful');
    } catch (error: any) {
      console.error('Login error:', error);
      
      // If popup is blocked or there was a problem with it, try redirect
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        console.log('Popup blocked or cancelled, trying redirect...');
        try {
          await signInWithGoogleRedirect();
        } catch (redirectErr: any) {
          console.error('Redirect login error:', redirectErr);
          alert(`Login failed: ${redirectErr.message}`);
        }
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.log('User closed the sign-in popup.');
      } else {
        // For other errors, offer to try redirect
        const tryRedirect = confirm(`Login popup failed (${error.message}). Would you like to try signing in via redirect instead?`);
        if (tryRedirect) {
          try {
            await signInWithGoogleRedirect();
          } catch (redirectErr: any) {
            alert(`Redirect login failed: ${redirectErr.message}`);
          }
        }
      }
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    console.log(`File selected: ${file.name}, size: ${file.size} bytes`);

    if (file.size > 10 * 1024 * 1024) {
      alert("File is too large. Please upload an image smaller than 10MB.");
      return;
    }

    if (appSettings?.isMaintenanceMode && !profile?.isAdmin) {
      alert("System is currently under maintenance. Please try again later.");
      return;
    }

    if (profile && profile.scansRemaining <= 0 && !profile.isAdmin) {
      alert("You have reached your scan limit. Please upgrade to a professional plan for unlimited access.");
      return;
    }

    setIsAnalyzing(true);
    setView('analyze');
    setActiveResult(null);

    const reader = new FileReader();
    reader.onerror = (e) => {
      console.error("FileReader error:", e);
      alert("Failed to read the file. Please try again.");
      setIsAnalyzing(false);
      setView('dashboard');
    };
    reader.onabort = () => {
      console.warn("FileReader aborted");
      setIsAnalyzing(false);
      setView('dashboard');
    };
    reader.onload = async (e) => {
      console.log("File read complete, starting analysis flow...");
      const base64 = e.target?.result as string;
      setUploadedBase64(base64);
      
      try {
        // Start analysis immediately
        console.log("Calling analyzeImage...");
        const analyzePromise = analyzeImage(base64);
        
        // Start storage upload in background
        console.log("Attempting background file upload to storage...");
        const storagePromise = uploadFile(user.uid, file).catch(storageErr => {
          console.warn("Storage upload failed or timed out in background. Ensure Storage is enabled.", storageErr);
          return '';
        });

        // Wait for analysis result
        const result = await analyzePromise;
        console.log("Analysis result received:", result?.decision);
        
        // Update UI immediately as analysis is done
        setActiveResult(result);
        setIsAnalyzing(false);
        setView('analyze'); 
        
        // Attempt to save to firestore in the background
        (async () => {
          try {
            const storedImageUrl = await storagePromise;
            console.log("Saving record to Firestore...");
            await saveRecord(user.uid, {
              fileName: file.name,
              imageUrl: storedImageUrl, 
              ...result
            });
            console.log("Record saved successfully");
            
            // Refresh statistics (non-blocking)
            getHistory(user.uid).then(setHistory).catch(console.error);
            ensureUserProfile(user).then(setProfile).catch(console.error);
          } catch (dbErr: any) {
            console.error("Failed to save analysis to history in background:", dbErr);
            // If it's a connection issue, log it clearly
            if (dbErr.message?.includes("unavailable") || dbErr.message?.includes("reach Cloud Firestore")) {
               console.warn("Firestore appears to be offline. Result not saved to history, but displayed to user.");
            }
          }
        })();
      } catch (err: any) {
        console.error("Analysis failed:", err);
        setIsAnalyzing(false); // Ensure we stop the spinner
        setActiveResult(null);
        alert(`Analysis Error: ${err.message}`);
        setView('dashboard');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLogout = () => auth.signOut();

  const downloadPDF = async () => {
    if (!reportRef.current || !activeResult) return;
    
    setIsGeneratingPDF(true);
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          const doc = clonedDoc as Document;
          
          // Show the header
          const header = doc.querySelector('.pdf-header');
          if (header) {
            header.classList.remove('hidden');
            (header as HTMLElement).style.display = 'block';
            (header as HTMLElement).style.borderColor = '#e5e7eb';
            (header as HTMLElement).querySelector('h1')?.style.setProperty('color', '#111827', 'important');
            (header as HTMLElement).querySelectorAll('p').forEach(p => p.style.setProperty('color', '#4b5563', 'important'));
          }

          // Force Expand Technical Analysis and ensure map visibility
          const analysisCard = doc.querySelector('.pdf-analysis-card');
          if (analysisCard) {
            (analysisCard as HTMLElement).style.maxHeight = 'none';
            (analysisCard as HTMLElement).style.overflow = 'visible';
            (analysisCard as HTMLElement).style.display = 'block';
            (analysisCard as HTMLElement).style.height = 'auto';
            (analysisCard as HTMLElement).style.backgroundColor = '#ffffff';
            (analysisCard as HTMLElement).style.color = '#111827';
          }

          const mapCard = doc.querySelector('.pdf-map-card');
          if (mapCard) {
            (mapCard as HTMLElement).style.width = '100%';
            (mapCard as HTMLElement).style.display = 'block';
            (mapCard as HTMLElement).style.backgroundColor = '#ffffff';
          }

          const confidenceCard = doc.querySelector('.pdf-confidence-card');
          if (confidenceCard) {
            (confidenceCard as HTMLElement).style.backgroundColor = '#f9fafb';
            (confidenceCard as HTMLElement).style.borderColor = '#e5e7eb';
          }

          // Sanitize colors to avoid OKLCH/OKLAB crashes and ensure dark text
          const styles = doc.querySelectorAll('style');
          styles.forEach(style => {
            if (style.innerHTML) {
              style.innerHTML = style.innerHTML
                .replace(/oklch\([^)]+\)/g, '#374151')
                .replace(/oklab\([^)]+\)/g, '#374151');
            }
          });

          const allElements = doc.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            
            // Fix text colors for PDF readability
            if (htmlEl.classList.contains('text-gray-400') || htmlEl.classList.contains('text-gray-500')) {
              htmlEl.style.color = '#4b5563';
            } else if (htmlEl.classList.contains('text-white')) {
              htmlEl.style.color = '#111827';
            }

            if (htmlEl.style) {
              const inlineStyle = htmlEl.getAttribute('style') || '';
              if (inlineStyle.includes('oklch') || inlineStyle.includes('oklab')) {
                htmlEl.setAttribute('style', inlineStyle
                  .replace(/oklch\([^)]+\)/g, '#4B5563')
                  .replace(/oklab\([^)]+\)/g, '#4B5563')
                );
              }
            }
            
            try {
              const computed = window.getComputedStyle(el);
              ['color', 'background-color', 'border-color', 'fill', 'stroke'].forEach(prop => {
                const val = computed.getPropertyValue(prop);
                if (val && (val.includes('oklch') || val.includes('oklab'))) {
                   let fallback = '#4B5563';
                   if (prop === 'color') fallback = '#111827';
                   if (prop === 'background-color' && htmlEl.classList.contains('bg-blue-600')) fallback = '#2563EB';
                   htmlEl.style.setProperty(prop, fallback, 'important');
                }
              });
            } catch (e) {}
          });
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      // Calculate height in PDF units
      const imgHeight = (canvasHeight * pdfWidth) / canvasWidth;
      
      let heightLeft = imgHeight;
      let position = 0;
      const margin = 10; // Extra margin between pages

      // Add the first page
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= (pdfHeight - margin);

      // Add extra pages if needed
      while (heightLeft > 0) {
        position = heightLeft - imgHeight - margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= (pdfHeight - margin);
      }
      
      pdf.save(`Forensic_Report_${activeResult.decision}_${Date.now()}.pdf`);
    } catch (err) {
      console.error('PDF Generation failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!user) return;
    await deleteRecord(user.uid, id);
    setHistory(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#050507] text-gray-200 font-sans selection:bg-blue-500/30">
      
      {/* --- Header --- */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-bottom border-gray-800 bg-[#050507]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView(user ? 'dashboard' : 'hero')}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Deepsecure<span className="text-blue-500">AI</span></span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {user && (
              <>
                <button 
                  onClick={() => setView('dashboard')}
                  className={cn('text-sm font-medium transition-colors', view === 'dashboard' ? 'text-white' : 'text-gray-400 hover:text-white')}
                >
                  Dashboard
                </button>
                <button 
                  onClick={() => setView('history')}
                  className={cn('text-sm font-medium transition-colors', view === 'history' ? 'text-white' : 'text-gray-400 hover:text-white')}
                >
                  History
                </button>
                {profile?.isAdmin && (
                  <button 
                    onClick={() => setView('admin')}
                    className={cn('text-sm font-medium transition-colors', view === 'admin' ? 'text-white' : 'text-gray-400 hover:text-white')}
                  >
                    Admin
                  </button>
                )}
              </>
            )}
            <div className="h-4 w-[1px] bg-gray-800" />
            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-medium text-white">{user.displayName}</span>
                  <span className="text-[10px] text-blue-500 font-mono uppercase tracking-widest">{profile?.subscriptionTier}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                   <LogOut className="w-4 h-4 mr-2" />
                   Sign Out
                </Button>
              </div>
            ) : (
              <Button onClick={handleLogin} loading={isLoginLoading}>
                Sign In with Google
              </Button>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button className="md:hidden p-2 text-gray-400" onClick={() => setIsNavOpen(!isNavOpen)}>
            {isNavOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Mobile Nav Overlay */}
      <AnimatePresence>
        {isNavOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-16 bg-[#0A0B10] border-b border-gray-800 z-40 p-4 flex flex-col gap-4 md:hidden shadow-2xl"
          >
             {user ? (
               <>
                 <button className="text-left py-2 font-medium" onClick={() => { setView('dashboard'); setIsNavOpen(false); }}>Dashboard</button>
                 <button className="text-left py-2 font-medium" onClick={() => { setView('history'); setIsNavOpen(false); }}>History</button>
                 {profile?.isAdmin && (
                   <button className="text-left py-2 font-medium text-blue-400" onClick={() => { setView('admin'); setIsNavOpen(false); }}>Admin Panel</button>
                 )}
                 <hr className="border-gray-800" />
                 <button className="text-left py-2 text-red-400 font-medium" onClick={handleLogout}>Sign Out</button>
               </>
             ) : (
               <Button onClick={() => { handleLogin(); setIsNavOpen(false); }} loading={isLoginLoading}>Sign In with Google</Button>
             )}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pt-24 pb-12 px-4 max-w-7xl mx-auto">
        
        {/* --- Hero View --- */}
        {view === 'hero' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs font-semibold mb-6">
                <Shield className="w-3 h-3" />
                V2.0 NOW LIVE - WITH PIXEL-LEVEL LOCALIZATION
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 leading-tight">
                Defend Reality Against <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Digital Forgery</span>
              </h1>
              <p className="text-gray-400 text-lg mb-10 leading-relaxed">
                State-of-the-art image forensic analysis. Detect deepfakes, AI-generated content, 
                and digital manipulations with surgical precision using our neural engines.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" onClick={handleLogin} loading={isLoginLoading}>
                  Get Started for Free <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button variant="secondary" size="lg">
                  Enterprise Solutions
                </Button>
              </div>

              <div className="mt-16 relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative bg-[#0A0B10] border border-gray-800 rounded-2xl overflow-hidden aspect-video shadow-2xl">
                   <img 
                      src="https://images.unsplash.com/photo-1639322537228-f710d846310a?auto=format&fit=crop&q=80&w=1200" 
                      alt="AI Analysis Interface" 
                      className="w-full h-full object-cover opacity-60"
                      referrerPolicy="no-referrer"
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-transparent to-transparent"></div>
                   <div className="absolute bottom-8 left-8 text-left">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="px-2 py-1 bg-blue-500 rounded text-[10px] font-bold text-white uppercase tracking-widest">Live Engine</div>
                        <span className="text-xs text-blue-400 font-mono">SCANNING FOR ARTIFACTS...</span>
                      </div>
                      <h3 className="text-xl font-bold text-white">Neural Integrity Engine V2.0</h3>
                   </div>
                </div>
              </div>
            </motion.div>

            {/* Mock Dashboard Preview */}
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 0.3, duration: 0.8 }}
               className="mt-20 w-full rounded-2xl border border-gray-800 bg-[#0A0B10]/50 p-4 shadow-2xl relative"
            >
               <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-600/10 rounded-full blur-[80px]" />
               <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-600/10 rounded-full blur-[80px]" />
               <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-gray-800" />
                  <div className="w-3 h-3 rounded-full bg-gray-800" />
                  <div className="w-3 h-3 rounded-full bg-gray-800" />
               </div>
               <div className="grid grid-cols-2 gap-4 h-64">
                  <div className="bg-gray-900/50 rounded-lg overflow-hidden relative border border-white/5">
                     <img src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=400" className="absolute inset-0 w-full h-full object-cover opacity-20" referrerPolicy="no-referrer" />
                     <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1/2 h-1 bg-blue-500/20 rounded animate-pulse" />
                     </div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg overflow-hidden relative border border-white/5">
                     <img src={imgAnalysis} className="absolute inset-0 w-full h-full object-cover opacity-20" referrerPolicy="no-referrer" />
                     <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1/3 h-1 bg-indigo-500/20 rounded animate-pulse" />
                     </div>
                  </div>
               </div>
            </motion.div>
          </div>
        )}

        {/* --- Dashboard View --- */}
        {view === 'dashboard' && profile && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">Command Center</h1>
                <p className="text-gray-400">Welcome back, {user?.displayName}. Monitoring systems active.</p>
              </div>
              <Card className="flex items-center gap-6 px-6 py-4 bg-blue-500/5 border-blue-500/10">
                <div>
                   <span className="text-[10px] font-mono text-blue-500 uppercase tracking-widest block mb-1">Scans Remaining</span>
                   <span className="text-2xl font-bold text-white">{profile.scansRemaining}</span>
                </div>
                <div className="w-[1px] h-10 bg-gray-800" />
                <div>
                   <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1">Total Processed</span>
                   <span className="text-2xl font-bold text-white">{profile.totalScans}</span>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Upload Section */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="p-12 border-dashed flex flex-col items-center justify-center text-center group cursor-pointer hover:border-blue-500/50 transition-all bg-[#0A0B11]">
                   <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileUpload}
                   />
                   <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                      <div className="w-20 h-20 bg-blue-600/10 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20 group-hover:bg-blue-600 group-hover:scale-110 transition-all">
                        <Upload className="w-10 h-10 text-blue-500 group-hover:text-white transition-colors" />
                      </div>
                      <h2 className="text-2xl font-bold text-white mb-2">Initialize Image Analysis</h2>
                      <p className="text-gray-400 mb-8 max-w-sm">Drag and drop any image file or click to browse. Supported: JPG, PNG, WEBP (Max 10MB)</p>
                      <Button size="lg" className="pointer-events-none">Select File</Button>
                   </label>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-indigo-400" />
                      </div>
                      <h3 className="font-bold text-white">Batched Analysis</h3>
                    </div>
                    <p className="text-sm text-gray-400 mb-4">Enterprise users can process entire directories and social media feeds simultaneously.</p>
                    <Button variant="ghost" size="sm" className="w-full">Upgrade for Batch Mode</Button>
                  </Card>
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                        <History className="w-5 h-5 text-emerald-400" />
                      </div>
                      <h3 className="font-bold text-white">Integrity History</h3>
                    </div>
                    <p className="text-sm text-gray-400 mb-4">Access a permanent ledger of your analyzed assets with secure hash verification.</p>
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setView('history')}>View Logs</Button>
                  </Card>
                </div>
              </div>

              {/* Sidebar / Stats */}
              <div className="space-y-6">
                <Card className="p-6">
                  <h3 className="font-bold text-white mb-4">System Status</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest">
                       <span className="text-gray-500">ML ENGINE (V4)</span>
                       <span className="text-green-500">ONLINE</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest">
                       <span className="text-gray-500">API LATENCY</span>
                       <span className="text-blue-500">42ms</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest">
                       <span className="text-gray-500">VERIFICATION BOTS</span>
                       <span className="text-gray-400">1,204 ACTIVE</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                   <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                     <AlertTriangle className="w-4 h-4 text-amber-500" />
                     Threat Intelligence
                   </h3>
                   <div className="space-y-4">
                      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                        <p className="text-xs text-gray-400 leading-relaxed">Recent surge in <span className="text-white">Flux-1.0</span> generated deepfakes detected in financial sectors.</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                        <p className="text-xs text-gray-400 leading-relaxed">New watermark spoofing vulnerability patched in <span className="text-white">v2.0.4</span>.</p>
                      </div>
                   </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* --- Analysis Loading/Result View --- */}
        {view === 'analyze' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between no-print">
               <Button variant="ghost" onClick={() => setView('dashboard')}>
                  &larr; Back to Dashboard
               </Button>
               {activeResult && (
                 <Button 
                   variant="outline" 
                   size="sm" 
                   onClick={downloadPDF}
                   loading={isGeneratingPDF}
                 >
                   <Download className="w-4 h-4 mr-2" />
                   Generate Forensic Report (PDF)
                 </Button>
               )}
            </div>

            <div ref={reportRef} className="space-y-8 p-4 rounded-xl pdf-export-container">
              <div className="hidden py-8 text-center border-b border-gray-800 mb-8 pdf-header">
                <h1 className="text-3xl font-bold mb-2 text-white">DeepsecureAI Forensic Intelligence Report</h1>
                <p className="text-gray-400">Scan ID: {activeResult ? 'DOC-' + Math.random().toString(36).substr(2, 9).toUpperCase() : 'N/A'}</p>
                <p className="text-gray-400">Generated: {formatDate(new Date())}</p>
              </div>

              {isAnalyzing ? (
                <Card className="p-20 flex flex-col items-center justify-center text-center">
                   <div className="relative mb-8">
                      <div className="w-24 h-24 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                         <ImageIcon className="w-10 h-10 text-blue-500/50" />
                      </div>
                   </div>
                   <h2 className="text-3xl font-bold text-white mb-2">Scanning Artifacts...</h2>
                   <p className="text-gray-400 max-w-sm">Our AI is performing frequency-domain analysis and checking for pixel-level inconsistencies.</p>
                   
                   <div className="mt-12 w-full max-w-md bg-gray-800 h-1.5 rounded-full overflow-hidden">
                      <motion.div 
                        className="bg-blue-600 h-full"
                        initial={{ width: '0%' }}
                        animate={{ width: '90%' }}
                        transition={{ duration: 5, ease: "easeInOut" }}
                      />
                   </div>
                </Card>
              ) : activeResult ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    <Card className={cn(
                      'flex-1 p-8 text-center border-2',
                      activeResult.decision === 'REAL' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-red-500/50 bg-red-500/5'
                    )}>
                      <div className="flex justify-center mb-6">
                         {activeResult.decision === 'REAL' ? (
                            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center">
                              <CheckCircle className="w-10 h-10 text-white" />
                            </div>
                         ) : (
                            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
                              <AlertTriangle className="w-10 h-10 text-white" />
                            </div>
                         )}
                      </div>
                      <h2 className="text-4xl font-bold text-white mb-2">{activeResult.decision}</h2>
                      <p className={cn(
                        'text-lg font-bold',
                        activeResult.decision === 'REAL' ? 'text-emerald-400' : 'text-red-400'
                      )}>{activeResult.confidence}% Confidence Score</p>
                    </Card>

                    <Card className="flex-1 p-8 pdf-confidence-card">
                       <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                          <Info className="w-5 h-5 text-blue-500" />
                          Executive Summary
                       </h3>
                       <p className="text-gray-300 leading-relaxed">{activeResult.summary}</p>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <Card className="p-6 pdf-map-card">
                        <h3 className="font-bold text-white mb-4">Localization Map</h3>
                        {uploadedBase64 ? (
                          <LocalizationMap image={uploadedBase64} regions={activeResult.manipulatedRegions} />
                        ) : (
                          <div className="aspect-video bg-gray-900/50 rounded-lg flex flex-col items-center justify-center border border-dashed border-gray-700">
                             <ImageIcon className="w-12 h-12 text-gray-700 mb-4" />
                             <p className="text-sm text-gray-500 max-w-xs text-center">
                               Original image data missing from this report. 
                               <span className="block mt-1 text-[10px] uppercase text-amber-500/70 tracking-tight font-mono">
                                 Note: History images require Firebase Storage enabled.
                               </span>
                             </p>
                          </div>
                        )}
                        <p className="text-sm text-gray-400 leading-relaxed mt-4">
                           <span className="text-white font-semibold">Observation:</span> {activeResult.localization}
                        </p>
                     </Card>
                     
                     <Card className="p-6 pdf-analysis-card">
                        <h3 className="font-bold text-white mb-4">Technical Analysis</h3>
                        <div className="prose prose-invert prose-sm max-w-none pdf-technical-text">
                          <ReactMarkdown>{activeResult.details}</ReactMarkdown>
                        </div>
                     </Card>
                  </div>
                </motion.div>
              ) : null}
            </div>
          </div>
        )}

        {/* --- History View --- */}
        {view === 'history' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
               <div>
                  <h1 className="text-3xl font-bold text-white">Audit Logs</h1>
                  <p className="text-gray-400">Review past forensic investigations.</p>
               </div>
               <Button variant="ghost" onClick={() => setView('dashboard')}>
                  Dashboard
               </Button>
            </div>

            <Card className="divide-y divide-gray-800">
               {history.length > 0 ? (
                 history.map((record) => (
                   <div key={record.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/5 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          'w-12 h-12 rounded-lg flex items-center justify-center shrink-0 border relative overflow-hidden',
                          record.decision === 'REAL' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
                        )}>
                          {record.imageUrl ? (
                             <img src={record.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" referrerPolicy="no-referrer" />
                          ) : (
                             record.decision === 'REAL' ? <CheckCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-white">{record.fileName}</span>
                            <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-400 font-mono">#{record.id.slice(0,6)}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                             <span className="flex items-center gap-1"><History className="w-3 h-3" /> {record.createdAt ? formatDate(record.createdAt.toDate()) : 'Recent'}</span>
                             <span className="flex items-center gap-1 font-bold text-blue-500">{record.confidence}% Sure</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                         <Button variant="ghost" size="sm" onClick={() => { 
                            setActiveResult(record as any); 
                            setUploadedBase64(record.image || record.imageUrl || null);
                            setView('analyze'); 
                          }}>
                            Open Report
                         </Button>
                         <Button variant="danger" size="sm" onClick={() => handleDeleteRecord(record.id)}>
                            <Trash2 className="w-4 h-4" />
                         </Button>
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="p-20 text-center flex flex-col items-center">
                    <History className="w-12 h-12 text-gray-700 mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">No Records Found</h3>
                    <p className="text-gray-400 mb-8">Start your first analysis to build an audit trail.</p>
                    <Button onClick={() => setView('dashboard')}>Scan Now</Button>
                 </div>
               )}
            </Card>
          </div>
        )}

        {/* --- Admin View --- */}
        {view === 'admin' && profile?.isAdmin && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
               <div>
                  <h1 className="text-3xl font-bold text-white uppercase tracking-tighter">System Administration</h1>
                  <p className="text-gray-400">Global access control and platform configuration.</p>
               </div>
               <Button variant="ghost" onClick={() => setView('dashboard')}>
                  Dashboard
               </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Stats Cards */}
              <Card className="p-6 relative overflow-hidden group">
                <img src="https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&q=80&w=400" className="absolute inset-0 w-full h-full object-cover opacity-[0.03] group-hover:opacity-[0.08] transition-opacity" referrerPolicy="no-referrer" />
                <div className="relative">
                  <h3 className="text-sm font-mono text-gray-500 uppercase mb-2">Total Managed Users</h3>
                  <p className="text-3xl font-bold text-white">{allUsers.length}</p>
                </div>
              </Card>
              <Card className="p-6 relative overflow-hidden group">
                <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=400" className="absolute inset-0 w-full h-full object-cover opacity-[0.03] group-hover:opacity-[0.08] transition-opacity" referrerPolicy="no-referrer" />
                <div className="relative">
                  <h3 className="text-sm font-mono text-gray-500 uppercase mb-2">Platform Status</h3>
                  <p className={cn(
                    "text-3xl font-bold",
                    appSettings?.isMaintenanceMode ? "text-red-500" : "text-emerald-500"
                  )}>
                    {appSettings?.isMaintenanceMode ? "Maintenance" : "Active"}
                  </p>
                </div>
              </Card>
              <Card className="p-6 relative overflow-hidden group">
                <img src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=400" className="absolute inset-0 w-full h-full object-cover opacity-[0.03] group-hover:opacity-[0.08] transition-opacity" referrerPolicy="no-referrer" />
                <div className="relative">
                  <h3 className="text-sm font-mono text-gray-500 uppercase mb-2">Standard Entry Credits</h3>
                  <p className="text-3xl font-bold text-blue-500">{appSettings?.defaultFreeScans || 0}</p>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* User Management Table */}
              <Card className="xl:col-span-2 overflow-hidden">
                <div className="p-6 border-b border-gray-800 bg-white/5">
                  <h3 className="font-bold text-white">Users Directory</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 bg-black/40">
                        <th className="p-4 text-xs font-mono text-gray-500 uppercase">User Identity</th>
                        <th className="p-4 text-xs font-mono text-gray-500 uppercase">Access Tier</th>
                        <th className="p-4 text-xs font-mono text-gray-500 uppercase">Status</th>
                        <th className="p-4 text-xs font-mono text-gray-500 uppercase">Operations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {allUsers.map((u) => (
                        <tr key={u.userId} className="hover:bg-white/5 transition-colors">
                          <td className="p-4">
                            <div className="font-bold text-white">{u.email}</div>
                            <div className="text-[10px] text-gray-500 font-mono tracking-widest">{u.userId}</div>
                          </td>
                          <td className="p-4">
                            <select 
                              value={u.subscriptionTier}
                              onChange={(e) => {
                                updateUserTier(u.userId, e.target.value as any);
                                setAllUsers(prev => prev.map(usr => usr.userId === u.userId ? {...usr, subscriptionTier: e.target.value as any} : usr));
                              }}
                              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                            >
                              <option value="free">Free</option>
                              <option value="premium">Premium</option>
                              <option value="enterprise">Enterprise</option>
                            </select>
                          </td>
                          <td className="p-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={u.isAdmin}
                                onChange={(e) => {
                                  updateUserTier(u.userId, u.subscriptionTier, e.target.checked);
                                  setAllUsers(prev => prev.map(usr => usr.userId === u.userId ? {...usr, isAdmin: e.target.checked} : usr));
                                }}
                                className="w-4 h-4 rounded border-gray-700 bg-gray-900"
                              />
                              <span className="text-xs text-gray-400">Admin</span>
                            </label>
                          </td>
                          <td className="p-4">
                             <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0"
                                onClick={() => setSelectedAdminUser(u)}
                             >
                                <Info className="w-4 h-4" />
                             </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Platform Controls */}
              <div className="space-y-6">
                <Card className="p-0 overflow-hidden relative min-h-[180px] border-blue-500/20 bg-blue-500/5 group">
                   <img 
                     src={imgGovernance} 
                     alt="Governance Visual" 
                     className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity duration-700"
                     referrerPolicy="no-referrer"
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B10] via-[#0A0B10]/60 to-transparent" />
                   <div className="relative p-6 pt-10">
                      <h3 className="font-bold text-white mb-6 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        Platform Governance
                      </h3>
                      <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <div>
                            <p className="text-sm font-bold text-white">Maintenance Mode</p>
                            <p className="text-xs text-gray-500">Temporarily disable public scanning</p>
                         </div>
                         <button 
                            onClick={async () => {
                              const newVal = !appSettings?.isMaintenanceMode;
                              setAppSettings(prev => prev ? {...prev, isMaintenanceMode: newVal} : null);
                              await updateAppSettings({ isMaintenanceMode: newVal });
                            }}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors relative",
                              appSettings?.isMaintenanceMode ? "bg-red-500" : "bg-gray-700"
                            )}
                         >
                            <div className={cn(
                              "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                              appSettings?.isMaintenanceMode ? "right-1" : "left-1"
                            )} />
                         </button>
                      </div>

                      <div className="space-y-2">
                         <p className="text-sm font-bold text-white">Default Credits</p>
                         <div className="flex gap-2">
                            <input 
                               type="number"
                               value={appSettings?.defaultFreeScans || 0}
                               onChange={(e) => setAppSettings(prev => prev ? {...prev, defaultFreeScans: parseInt(e.target.value)} : null)}
                               className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white w-full outline-none focus:border-blue-500"
                            />
                            <Button size="sm" onClick={() => appSettings && updateAppSettings({ defaultFreeScans: appSettings.defaultFreeScans })}>Save</Button>
                         </div>
                      </div>

                      <div className="flex items-center justify-between">
                         <div>
                            <p className="text-sm font-bold text-white">Public Registrations</p>
                            <p className="text-xs text-gray-500">Allow new users to sign up</p>
                         </div>
                         <button 
                            onClick={async () => {
                              const newVal = !appSettings?.allowPublicRegistrations;
                              setAppSettings(prev => prev ? {...prev, allowPublicRegistrations: newVal} : null);
                              await updateAppSettings({ allowPublicRegistrations: newVal });
                            }}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors relative",
                              appSettings?.allowPublicRegistrations ? "bg-blue-600" : "bg-gray-700"
                            )}
                         >
                            <div className={cn(
                              "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                              appSettings?.allowPublicRegistrations ? "right-1" : "left-1"
                            )} />
                         </button>
                      </div>
                   </div>
                </div>
             </Card>

                <Card className="p-0 border-blue-500/20 bg-blue-500/5 overflow-hidden relative min-h-[220px] group">
                   <img 
                     src={imgAudit} 
                     alt="Audit Terminal" 
                     className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-50 transition-opacity duration-700"
                     referrerPolicy="no-referrer"
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B10] via-[#0A0B10]/50 to-transparent" />
                   <div className="relative p-6 pt-12">
                      <h3 className="font-bold text-white mb-2">Audit Status</h3>
                      <p className="text-xs text-gray-400 leading-relaxed mb-4">
                        Platform has processed <span className="text-white font-bold">{allUsers.reduce((acc, u) => acc + (u.totalScans || 0), 0)}</span> scans across all managed accounts.
                      </p>
                      <Button variant="ghost" size="sm" className="w-full">Download Platform Audit Log</Button>
                   </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* --- User Details Modal --- */}
        <AnimatePresence>
          {selectedAdminUser && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedAdminUser(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-[#0A0B10] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">User Intelligence Profile</h3>
                  <button onClick={() => setSelectedAdminUser(null)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center justify-center">
                      <UserIcon className="w-8 h-8 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">{selectedAdminUser.email}</h4>
                      <p className="text-xs text-gray-500 font-mono tracking-tighter">{selectedAdminUser.userId}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-1">Access Level</p>
                      <p className="font-bold text-blue-500 uppercase">{selectedAdminUser.subscriptionTier}</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-1">Privileges</p>
                      <p className="font-bold text-white">{selectedAdminUser.isAdmin ? 'Administrator' : 'Standard User'}</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-1">Scans Remaining</p>
                      <p className="font-bold text-white">{selectedAdminUser.scansRemaining}</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-1">Total Operations</p>
                      <p className="font-bold text-white">{selectedAdminUser.totalScans}</p>
                    </div>
                  </div>

                  {selectedAdminUser.createdAt && (
                    <div className="p-4 bg-blue-600/5 border border-blue-500/10 rounded-xl">
                      <p className="text-[10px] text-blue-500/70 uppercase tracking-widest font-mono mb-1">Audit Trail Joined</p>
                      <p className="text-sm font-medium text-white">{formatDate(selectedAdminUser.createdAt.toDate())}</p>
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setSelectedAdminUser(null)}>
                      Close Profile
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => {
                        // In a real app, this might email the user or open a support chat
                        alert(`Direct communication link established with ${selectedAdminUser.email}`);
                    }}>
                      Contact User
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>

      {/* --- Footer --- */}
      <footer className="mt-auto border-t border-gray-800 py-12 px-4">
         <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold tracking-tight text-white uppercase text-sm">DeepsecureAI Systems</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-sm italic">
                "In a post-truth world, verification is not just a tool—it's a fundamental human right. 
                DeepsecureAI is dedicated to preserving digital integrity through neural excellence."
              </p>
            </div>
            <div>
               <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-widest">Platform</h4>
               <ul className="space-y-2 text-sm text-gray-400">
                  <li className="hover:text-white cursor-pointer">Neural Engines</li>
                  <li className="hover:text-white cursor-pointer">Batch API</li>
                  <li className="hover:text-white cursor-pointer">Browser Extension</li>
                  <li className="hover:text-white cursor-pointer">Enterprise SLA</li>
               </ul>
            </div>
            <div>
               <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-widest">Legal</h4>
               <ul className="space-y-2 text-sm text-gray-400">
                  <li className="hover:text-white cursor-pointer">Privacy Policy</li>
                  <li className="hover:text-white cursor-pointer">Terms of Audit</li>
                  <li className="hover:text-white cursor-pointer">Limitations of AI</li>
                  <li className="hover:text-white cursor-pointer">Cookie Settings</li>
               </ul>
            </div>
         </div>
         <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-900 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm italic mb-2">
              DeepsecureAI is an AI-powered detection tool. Results are probabilistic forensic indicators and should not be used as sole evidence in legal proceedings.
            </p>
            <p className="text-xs text-gray-600">&copy; 2026 DeepsecureAI Systems Intl. All rights reserved.</p>
            <div className="flex items-center gap-6">
               <span className="text-xs text-green-500/80 font-mono flex items-center gap-1">
                 <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                 ALL SYSTEMS OPERATIONAL
               </span>
            </div>
         </div>
      </footer>

    </div>
  );
}
