import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Plus, Send, Trash2, Bot, User, CornerDownLeft } from "lucide-react";

const App = () => {
  return (
    <HashRouter>
      <ChatProvider>
        <Routes>
          <Route path="/" element={<ChatLayout />}>
            <Route index element={<WelcomeScreen />} />
            <Route path="chat/:id" element={<ChatScreen />} />
          </Route>
        </Routes>
      </ChatProvider>
    </HashRouter>
  );
};

const ChatContext = React.createContext();

const ChatProvider = ({ children }) => {
    const [chats, setChats] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        try {
            const savedChats = localStorage.getItem("gemini_chats");
            if (savedChats) {
                setChats(JSON.parse(savedChats));
            }
        } catch (error) {
            console.error("Failed to load chats from local storage", error);
            setChats([]);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem("gemini_chats", JSON.stringify(chats));
        } catch (error) {
            console.error("Failed to save chats to local storage", error);
        }
    }, [chats]);

    const createNewChat = () => {
        const newChatId = `chat_${Date.now()}`;
        const newChat = { id: newChatId, title: "محادثة جديدة", messages: [] };
        setChats(prevChats => [newChat, ...prevChats]);
        navigate(`/chat/${newChatId}`);
    };

    const deleteChat = (chatId) => {
        setChats(prevChats => prevChats.filter(c => c.id !== chatId));
        navigate(`/`);
    };

    const addMessage = (chatId, message) => {
        setChats(prevChats => {
            const chatIndex = prevChats.findIndex(c => c.id === chatId);
            if (chatIndex === -1) return prevChats;

            const updatedChats = [...prevChats];
            const chat = { ...updatedChats[chatIndex] };
            
            // Update message or add new one
            const existingMsgIndex = chat.messages.findIndex(m => m.id === message.id);
            if (existingMsgIndex !== -1) {
                chat.messages = [...chat.messages];
                chat.messages[existingMsgIndex] = message;
            } else {
                chat.messages = [...chat.messages, message];
            }

            // Update title from first user message
            if (chat.messages.length === 1 && chat.messages[0].role === 'user') {
                chat.title = chat.messages[0].content.substring(0, 25) + '...';
            }

            updatedChats[chatIndex] = chat;
            return updatedChats;
        });
    };

    const getChat = (chatId) => chats.find(c => c.id === chatId);

    const contextValue = { chats, createNewChat, deleteChat, addMessage, getChat };

    return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
};

const useChat = () => React.useContext(ChatContext);

const ChatLayout = () => {
  const { chats, createNewChat, deleteChat } = useChat();
  const { id } = useParams();
  const location = useLocation();

  return (
    <div className="flex h-screen w-screen bg-background text-foreground font-sans rtl">
      <aside className="w-72 bg-card border-l border-border flex flex-col p-4 space-y-4">
        <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-primary-foreground">مساعدك الذكي</h1>
            <button onClick={createNewChat} className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
                <Plus size={20} />
            </button>
        </div>
        <nav className="flex-1 overflow-y-auto pr-2 -ml-2 space-y-2">
            {chats.map(chat => (
                <Link to={`/chat/${chat.id}`} key={chat.id} 
                      className={`flex items-center justify-between p-3 rounded-lg text-sm text-right transition-colors ${id === chat.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                    <span className="truncate">{chat.title}</span>
                </Link>
            ))}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
             <Routes location={location}>
                <Route index element={<WelcomeScreen />} />
                <Route path="chat/:id" element={<ChatScreen />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

const WelcomeScreen = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Bot size={64} className="text-primary mb-4" />
        <h2 className="text-3xl font-bold text-primary-foreground mb-2">ابدأ محادثة جديدة</h2>
        <p className="text-muted-foreground max-w-md">اختر محادثة سابقة من القائمة أو انقر على زر '+' لبدء محادثة جديدة مع مساعدك الذكي.</p>
    </div>
)


const ChatScreen = () => {
  const { id } = useParams();
  const { getChat, addMessage, deleteChat } = useChat();
  const chat = getChat(id);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chat?.messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userInput = input;
    setInput("");

    const userMessage = { id: `msg_${Date.now()}`, role: 'user', content: userInput };
    addMessage(id, userMessage);

    setIsStreaming(true);
    const aiMessageId = `msg_${Date.now() + 1}`;
    let fullResponse = "";
    addMessage(id, { id: aiMessageId, role: 'assistant', content: "..." });

    try {
      const response = await fetch(window.__AI_ENDPOINT__, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: "gemini-1.5-flash-latest",
          messages: [...(chat?.messages || []), userMessage].map(m => ({role: m.role, content: m.content}))
        })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.substring(5));
            if (data.choices && data.choices[0].delta.content) {
               fullResponse += data.choices[0].delta.content;
               addMessage(id, { id: aiMessageId, role: 'assistant', content: fullResponse + " ▋" });
            }
          }
        }
      }
    } catch (error) {
      console.error("Error streaming response:", error);
      addMessage(id, { id: aiMessageId, role: 'assistant', content: "عذراً، حدث خطأ ما. يرجى المحاولة مرة أخرى." });
    } finally {
      addMessage(id, { id: aiMessageId, role: 'assistant', content: fullResponse });
      setIsStreaming(false);
    }
  };
  
  if (!chat) {
     return <WelcomeScreen/>
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">{chat.title}</h2>
        <button onClick={() => deleteChat(id)} className="p-2 rounded-md text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors">
            <Trash2 size={18} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {chat.messages.length === 0 && (
             <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot size={48} className="text-primary mb-4" />
                <h2 className="text-2xl font-bold text-primary-foreground">أهلاً بك</h2>
                <p className="text-muted-foreground">كيف يمكنني مساعدتك اليوم؟</p>
            </div>
        )}
        <AnimatePresence initial={false}>
          {chat.messages.map((message) => (
            <motion.div
              key={message.id}
              layout
              initial={{ opacity: 0, scale: 0.8, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <Message message={message} />
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-border">
        <form onSubmit={handleSendMessage} className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                }
            }}
            placeholder="اكتب رسالتك هنا..."
            className="w-full bg-input border border-border rounded-lg py-3 pr-4 pl-12 resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            rows={1}
            style={{ minHeight: '52px' }}
            disabled={isStreaming}
          />
          <button type="submit" disabled={isStreaming || !input.trim()} className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground transition-colors">
            {isStreaming ? <CornerDownLeft size={20} className="animate-pulse" /> : <Send size={20} />}
          </button>
        </form>
      </div>
    </div>
  );
};

const MarkdownRenderer = ({ content }) => {
    const formattedContent = useMemo(() => {
        let html = content.replace(/\n/g, '<br />');
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        // Code blocks
        html = html.replace(/```(.*?)```/gs, (match, p1) => {
            const codeContent = p1.replace(/<br \/>/g, '\n').trim();
            const escapedCode = codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre class="bg-card p-3 my-2 rounded-md overflow-x-auto text-sm font-mono whitespace-pre-wrap"><code>${escapedCode}</code></pre>`;
        });
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code class="bg-muted text-sm rounded px-1 py-0.5">$1</code>');

        return html;
    }, [content]);

    return <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: formattedContent }} />;
};

const Message = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={`flex items-start gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
          <div className="bg-primary text-primary-foreground h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0">
              <Bot size={20} />
          </div>
      )}
      <div className={`max-w-xl p-4 rounded-xl ${isUser ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
        <div className="text-right leading-relaxed font-serif whitespace-pre-wrap">
             <MarkdownRenderer content={message.content} />
        </div>
      </div>
        {isUser && (
          <div className="bg-muted text-muted-foreground h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0">
              <User size={20} />
          </div>
      )}
    </div>
  );
};

createRoot(document.getElementById("root")).render(<App />);
