import { Waves, Zap, ArrowRight, Mail, Phone, MapPin } from 'lucide-react';

export default function Landing({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950">

      <nav className="fixed top-0 w-full bg-slate-950/80 backdrop-blur-sm border-b border-slate-800 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Waves className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">SmartAqua <span className="text-cyan-400">Pro</span></span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#home" className="text-sm text-slate-400 hover:text-white transition-colors">Home</a>
            <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors">Features</a>
            <a href="#about" className="text-sm text-slate-400 hover:text-white transition-colors">About</a>
            <a href="#team" className="text-sm text-slate-400 hover:text-white transition-colors">Team</a>
            <a href="#contact" className="text-sm text-slate-400 hover:text-white transition-colors">Contact</a>
            <button onClick={onGetStarted} className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-600/20">Login</button>
          </div>
          <button onClick={onGetStarted} className="md:hidden px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all">Login</button>
        </div>
      </nav>

      {/* Hero */}
      <section id="home" className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-xs text-cyan-400 mb-6">
                <Zap className="w-3.5 h-3.5" /> IoT-Based Aquarium Management System
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                Smart Aquarium<br />
                <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Monitoring, Automation</span><br />
                & Management
              </h1>
              <p className="text-base text-slate-400 mb-8 leading-relaxed">
                SmartAqua Pro is an IoT-based intelligent aquarium monitoring, automation, and management system that provides real-time monitoring, automated control, and centralized digital supervision of aquarium environments.
              </p>
              <div className="flex items-center gap-4">
                <button onClick={onGetStarted} className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-cyan-600/20">
                  Get Started <ArrowRight className="w-4 h-4" />
                </button>
                <a href="#features" className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-all border border-slate-700">Learn More</a>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-10">
                {[
                  { value: '4', label: 'Aquariums' },
                  { value: '5+', label: 'Sensors' },
                  { value: '6+', label: 'Rules' },
                  { value: '3', label: 'User Roles' },
                ].map((stat) => (
                  <div key={stat.label} className="text-center bg-slate-800/50 border border-slate-700/50 rounded-xl py-3">
                    <p className="text-xl font-bold text-cyan-400">{stat.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center">
              <div className="relative w-110 h-[30rem]">
                <div className="absolute inset-0 rounded-3xl border-2 border-cyan-500/20 bg-gradient-to-b from-cyan-500/5 via-blue-500/10 to-blue-900/20 overflow-hidden">
                  <div className="h-8 bg-gradient-to-b from-cyan-400/10 to-transparent">
                    <div className="w-full h-full flex">
                      <div className="w-1/3 h-full bg-cyan-400/5 animate-pulse rounded-b-full" />
                      <div className="w-1/4 h-full bg-cyan-400/8 animate-pulse rounded-b-full" style={{ animationDelay: '0.5s' }} />
                    </div>
                  </div>
                  <div className="absolute left-1/4 bottom-0">
                    <div className="w-3 h-3 bg-cyan-400/20 rounded-full animate-bounce" style={{ animationDuration: '3s', animationIterationCount: 'infinite' }} />
                  </div>
                  <div className="absolute left-1/2 bottom-4">
                    <div className="w-2 h-2 bg-cyan-400/15 rounded-full animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '1s', animationIterationCount: 'infinite' }} />
                  </div>
                  <div className="absolute left-2/3 bottom-2">
                    <div className="w-2.5 h-2.5 bg-cyan-400/15 rounded-full animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '0.3s', animationIterationCount: 'infinite' }} />
                  </div>
                  <div className="absolute left-1/3 bottom-6">
                    <div className="w-2 h-2 bg-cyan-400/10 rounded-full animate-bounce" style={{ animationDuration: '4s', animationDelay: '1.5s', animationIterationCount: 'infinite' }} />
                  </div>
                  <div className="absolute top-1/3 left-1/4 text-5xl" style={{ animation: 'swim 8s ease-in-out infinite' }}>🐠</div>
                  <div className="absolute top-1/2 right-1/4 text-4xl" style={{ animation: 'swim2 10s ease-in-out infinite' }}>🐟</div>
                  <div className="absolute bottom-12 left-1/3 text-3xl" style={{ animation: 'swim3 7s ease-in-out infinite' }}>🐡</div>
                  <div className="absolute bottom-0 left-6 text-3xl">🌿</div>
                  <div className="absolute bottom-0 right-8 text-2xl">🌱</div>
                  <div className="absolute bottom-0 left-1/2 text-2xl">🌿</div>
                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-amber-900/30 to-transparent rounded-b-3xl" />
                  <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 to-transparent pointer-events-none" />
                </div>
                <div className="absolute -top-4 -right-4 bg-slate-800/90 border border-emerald-500/30 rounded-xl px-3 py-2 backdrop-blur-sm shadow-lg shadow-emerald-500/10" style={{ animation: 'float 4s ease-in-out infinite' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌡️</span>
                    <div>
                      <p className="text-xs text-slate-500">Temp</p>
                      <p className="text-sm font-bold text-emerald-400">26.4°C ✓</p>
                    </div>
                  </div>
                </div>
                <div className="absolute top-1/3 -left-6 bg-slate-800/90 border border-cyan-500/30 rounded-xl px-3 py-2 backdrop-blur-sm shadow-lg shadow-cyan-500/10" style={{ animation: 'float 5s ease-in-out infinite', animationDelay: '1s' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💧</span>
                    <div>
                      <p className="text-xs text-slate-500">Level</p>
                      <p className="text-sm font-bold text-cyan-400">85%</p>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-4 right-4 bg-slate-800/90 border border-amber-500/30 rounded-xl px-3 py-2 backdrop-blur-sm shadow-lg shadow-amber-500/10" style={{ animation: 'float 4.5s ease-in-out infinite', animationDelay: '2s' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚨</span>
                    <div>
                      <p className="text-xs text-slate-500">Alert</p>
                      <p className="text-sm font-bold text-amber-400">1 Warning</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features - NOW FIRST */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Key Features</h2>
            <p className="text-slate-400 max-w-lg mx-auto">Everything you need to monitor, automate, and manage your aquarium ecosystem.</p>
            <div className="w-16 h-1 bg-cyan-500 mx-auto rounded-full mt-3"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '🌡️', title: 'Real-time Monitoring', desc: 'Track temperature, water level, water quality, pH, and turbidity in real-time with live sensor data.', color: 'from-orange-500 to-red-500' },
              { icon: '⚙️', title: 'Intelligent Automation', desc: 'Rule-based automation for feeding, lighting, and filtration with bioload-based fish classification.', color: 'from-purple-500 to-indigo-500' },
              { icon: '🔔', title: 'Alert & Notification', desc: 'Instant warnings for abnormal conditions, system risks, and power outage detection.', color: 'from-amber-500 to-orange-500' },
              { icon: '📊', title: 'Data Logging & Reports', desc: 'Historical data analysis, interactive charts, and exportable CSV reports for long-term management.', color: 'from-emerald-500 to-green-500' },
              { icon: '🛡️', title: 'User Management', desc: 'Role-based access control with Admin, Operator, and Viewer permissions.', color: 'from-red-500 to-pink-500' },
              { icon: '📱', title: 'Mobile Accessible', desc: 'Monitor and control your aquariums anytime, anywhere through web and mobile.', color: 'from-cyan-500 to-blue-500' },
            ].map((feature) => (
              <div key={feature.title} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:border-cyan-500/30 transition-all">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 text-xl`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About - NOW SECOND */}
      <section id="about" className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">About the Project</h2>
            <div className="w-16 h-1 bg-cyan-500 mx-auto rounded-full"></div>
          </div>
          <p className="text-center max-w-3xl mx-auto text-slate-400 leading-relaxed mb-6">Aquarium management requires continuous monitoring of environmental conditions such as water temperature, water level, water quality, lighting, and feeding schedules to maintain a stable and healthy aquatic ecosystem.</p>
          <p className="text-center max-w-3xl mx-auto text-slate-400 leading-relaxed">SmartAqua Pro addresses these challenges by integrating IoT-based sensing, rule-based automation, real-time alerts, and digital record management into a single platform.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
            <div className="text-center bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🏠</div>
              <h4 className="text-white font-semibold mb-2">Home Aquariums</h4>
              <p className="text-sm text-slate-400">Help hobbyists monitor water conditions, automate feeding and lighting, and reduce risks.</p>
            </div>
            <div className="text-center bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🏫</div>
              <h4 className="text-white font-semibold mb-2">Schools & Facilities</h4>
              <p className="text-sm text-slate-400">Assist schools in maintaining aquarium stability and reducing manual care dependency.</p>
            </div>
            <div className="text-center bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🔬</div>
              <h4 className="text-white font-semibold mb-2">Research & Labs</h4>
              <p className="text-sm text-slate-400">Support research with data logging, historical analysis, and long-term management.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Objectives */}
      <section id="objectives" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Project Objectives</h2>
            <div className="w-16 h-1 bg-cyan-500 mx-auto rounded-full mt-3"></div>
          </div>
          <div className="space-y-4">
            {[
              { num: '01', text: 'Develop an IoT-based data collection and monitoring system that gathers real-time aquarium parameters such as temperature, water level, and water quality.' },
              { num: '02', text: 'Design and implement rule-based intelligent automation for feeding, lighting, and filtration using predefined thresholds, conditions, schedules, and bioload-based fish classification.' },
              { num: '03', text: 'Develop a centralized monitoring platform (web and mobile application) for real-time monitoring, remote control, user management, and improved accessibility.' },
              { num: '04', text: 'Integrate an alert and notification system that provides real-time warnings for abnormal conditions, system risks, and power outages.' },
              { num: '05', text: 'Implement data logging, historical analysis, and reporting features to support system evaluation, decision-making, and long-term aquarium management.' },
            ].map((obj) => (
              <div key={obj.num} className="flex items-start gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-cyan-500/30 transition-all">
                <span className="text-2xl font-bold text-cyan-400 flex-shrink-0">{obj.num}</span>
                <p className="text-sm text-slate-300 pt-1">{obj.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section id="team" className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Development Team</h2>
          <p className="text-slate-400 mb-10">BS Information Technology • Institute of Computing • DNSC</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Dennis Mark L. Jamero', role: 'Lead Developer', initials: 'DM' },
              { name: 'Wendyl Ziv S. Arellano', role: 'Backend Developer', initials: 'WA' },
              { name: 'Gian Carlo R. Marin', role: 'IoT & Hardware', initials: 'GM' },
            ].map((member) => (
              <div key={member.name} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:border-cyan-500/30 transition-all">
                <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-white">{member.initials}</span>
                </div>
                <h4 className="text-white font-semibold text-lg">{member.name}</h4>
                <p className="text-sm text-cyan-400 mt-1">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Contact Us</h2>
            <p className="text-slate-400">Have questions? Get in touch with the SmartAqua Pro team.</p>
            <div className="w-16 h-1 bg-cyan-500 mx-auto rounded-full mt-3"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0"><MapPin className="w-5 h-5 text-cyan-400" /></div>
                <div>
                  <h4 className="text-white font-medium">Location</h4>
                  <p className="text-sm text-slate-400">Davao del Norte State College, Panabo City</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0"><Mail className="w-5 h-5 text-cyan-400" /></div>
                <div>
                  <h4 className="text-white font-medium">Email</h4>
                  <p className="text-sm text-slate-400">smartaqua.pro@dnsc.edu.ph</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0"><Phone className="w-5 h-5 text-cyan-400" /></div>
                <div>
                  <h4 className="text-white font-medium">Phone</h4>
                  <p className="text-sm text-slate-400">09912879123</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Send a Message</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Your Name" className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <input type="email" placeholder="Your Email" className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <textarea placeholder="Your Message" rows={4} className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
                <button className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all">Send Message</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl p-10">
            <Waves className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-white mb-3">Ready to Get Started?</h2>
            <p className="text-slate-400 mb-6">Experience intelligent aquarium monitoring and automation with SmartAqua Pro.</p>
            <button onClick={onGetStarted} className="inline-flex items-center gap-2 px-8 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-base font-medium transition-all shadow-lg shadow-cyan-600/20">
              Launch Dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center"><Waves className="w-4 h-4 text-white" /></div>
            <span className="text-sm text-slate-400">SmartAqua Pro © 2026</span>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-500">Davao del Norte State College</p>
            <p className="text-xs text-slate-600">Institute of Computing • Panabo City, Davao del Norte</p>
          </div>
          <div className="text-xs text-slate-600">BS Information Technology</div>
        </div>
      </footer>
    </div>
  );
}