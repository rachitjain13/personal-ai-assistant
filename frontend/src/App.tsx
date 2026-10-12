import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowUp,
  Bell,
  ChevronDown,
  FileText,
  LogOut,
  Mail,
  Moon,
  Monitor,
  Palette,
  Sun,
  Menu,
  Mic,

  Paperclip,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
  Trash2
} from "lucide-react";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult:
    | ((event: SpeechRecognitionEvent) => void)
    | null;
  onerror:
    | ((event: SpeechRecognitionErrorEvent) => void)
    | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type Chat = {
  id: string;
  title: string;
  mode?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  previewUrl?: string;
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextRemaining: number;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  usage?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    requestCount: number;
  };
};

type Message = {
  id: string;
  role: "user" | "model";
  content: string;
  attachments?: {
    name: string;
    type: string;
  }[];
};

function App() {
  // -----------------------------
  // AUTH STATE
  // -----------------------------
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem("personal-ai-auth-token")
  );
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem("personal-ai-user");
      return saved ? JSON.parse(saved) as AuthUser : null;
    } catch {
      return null;
    }
  });
  const [authLoading, setAuthLoading] = useState(true);

  // -----------------------------
  // UI STATE
  // -----------------------------

  const [sidebarOpen, setSidebarOpen] =
    useState(true);

  const [message, setMessage] =
    useState("");
  const [isListening, setIsListening] =
  useState(false);

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
    const saved = localStorage.getItem("personal-ai-theme");
    return saved === "light" || saved === "system" ? saved : "dark";
  });

  useEffect(() => {
    localStorage.setItem("personal-ai-theme", theme);

    const root = document.documentElement;
    root.classList.toggle("personal-ai-light", theme === "light");
    root.classList.toggle("personal-ai-dark", theme === "dark");

    if (theme === "system") {
      root.classList.toggle(
        "personal-ai-light",
        window.matchMedia("(prefers-color-scheme: light)").matches
      );
      root.classList.toggle("personal-ai-dark", false);
    }
  }, [theme]);

  // -----------------------------
  // CHAT STATE
  // -----------------------------

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [attachments, setAttachments] =
    useState<Attachment[]>([]);

  const fileInputRef =
    useRef<HTMLInputElement>(null);
  const [conversationId, setConversationId] =
    useState<string | null>(null);
  const [conversations, setConversations] =
    useState<Chat[]>([]);

  const [isGenerating, setIsGenerating] =
    useState(false);

  const CONTEXT_WINDOW_TOKENS = 1_048_576;
  const [lastTokenUsage, setLastTokenUsage] =
    useState<TokenUsage | null>(() => {
      try {
        const savedUser = localStorage.getItem("personal-ai-user");
        const user = savedUser ? JSON.parse(savedUser) as AuthUser : null;
        const key = user?.id
          ? `personal-ai-last-token-usage-${user.id}`
          : "personal-ai-last-token-usage";
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) as TokenUsage : null;
      } catch {
        return null;
      }
    });
  const [sessionTokensUsed, setSessionTokensUsed] =
    useState<number>(() => {
      try {
        const savedUser = localStorage.getItem("personal-ai-user");
        const user = savedUser ? JSON.parse(savedUser) as AuthUser : null;
        return Number(user?.usage?.totalTokens || 0);
      } catch {
        return 0;
      }
    });
  const [showTokenUsage, setShowTokenUsage] = useState(false);

  useEffect(() => {
    if (currentUser) {
      const updatedUser = {
        ...currentUser,
        usage: {
          ...(currentUser.usage || {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            requestCount: 0,
          }),
          totalTokens: sessionTokensUsed,
        },
      };
      localStorage.setItem("personal-ai-user", JSON.stringify(updatedUser));
    }
  }, [sessionTokensUsed]);

  useEffect(() => {
    if (lastTokenUsage && currentUser) {
      localStorage.setItem(
        `personal-ai-last-token-usage-${currentUser.id}`,
        JSON.stringify(lastTokenUsage)
      );
    }
  }, [lastTokenUsage, currentUser]);

  const authorizedFetch = async (
    url: string,
    options: RequestInit = {}
  ) => {
    const token = authToken || localStorage.getItem("personal-ai-auth-token");
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(url, { ...options, headers });
  };

  const handleAuthenticated = (token: string, user: AuthUser) => {
    localStorage.setItem("personal-ai-auth-token", token);
    localStorage.setItem("personal-ai-user", JSON.stringify(user));
    setAuthToken(token);
    setCurrentUser(user);
    setSessionTokensUsed(Number(user.usage?.totalTokens || 0));
    setLastTokenUsage(null);
  };

  const openSettings = () => {
    setAccountMenuOpen(false);
    setSettingsOpen(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("personal-ai-auth-token");
    localStorage.removeItem("personal-ai-user");
    if (currentUser) {
      localStorage.removeItem(`personal-ai-last-token-usage-${currentUser.id}`);
    }
    setAuthToken(null);
    setCurrentUser(null);
    setConversations([]);
    setMessages([]);
    setConversationId(null);
    setSessionTokensUsed(0);
    setLastTokenUsage(null);
    setAccountMenuOpen(false);
    setSettingsOpen(false);
  };

  // Verify the saved login and restore account-specific data.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = localStorage.getItem("personal-ai-auth-token");

      if (!token) {
        if (!cancelled) setAuthLoading(false);
        return;
      }

      try {
        const response = await fetch(" https://personal-ai-assistant-1mud.onrender.com/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Session expired");
        }

        const data = await response.json();

        if (!cancelled) {
          const user = data.user as AuthUser;
          setAuthToken(token);
          setCurrentUser(user);
          setSessionTokensUsed(Number(user.usage?.totalTokens || 0));

          const savedUsage = localStorage.getItem(
            `personal-ai-last-token-usage-${user.id}`
          );
          if (savedUsage) {
            setLastTokenUsage(JSON.parse(savedUsage) as TokenUsage);
          }
        }
      } catch (error) {
        console.error("Auth restore failed:", error);
        localStorage.removeItem("personal-ai-auth-token");
        localStorage.removeItem("personal-ai-user");
        if (!cancelled) {
          setAuthToken(null);
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);

  const voiceRecognitionRef =
    useRef<SpeechRecognitionInstance | null>(null);

  const MAX_FILE_SIZE = 6 * 1024 * 1024;
  const MAX_ATTACHMENTS = 3;

  const ALLOWED_FILE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
  ];

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result;

        if (typeof result !== "string") {
          reject(new Error("Failed to convert file"));
          return;
        }

        const commaIndex = result.indexOf(",");
        if (commaIndex === -1) {
          reject(new Error("Invalid file data"));
          return;
        }

        resolve(result.slice(commaIndex + 1));
      };

      reader.onerror = () => {
        reject(reader.error || new Error("Failed to read file"));
      };

      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) return;

    const remaining = MAX_ATTACHMENTS - attachments.length;

    if (remaining <= 0) {
      window.alert(`You can attach maximum ${MAX_ATTACHMENTS} files.`);
      return;
    }

    const selectedFiles = files.slice(0, remaining);
    const newAttachments: Attachment[] = [];

    for (const file of selectedFiles) {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        window.alert(
          `${file.name} is not supported. Allowed: JPG, PNG, WEBP, PDF, TXT and CSV.`
        );
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        window.alert(`${file.name} is larger than 6 MB.`);
        continue;
      }

      try {
        const data = await readFileAsBase64(file);

        newAttachments.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          name: file.name,
          type: file.type,
          size: file.size,
          data,
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
        });
      } catch (error) {
        console.error("Failed to read file:", error);
        window.alert(`Could not read ${file.name}.`);
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((previous) => [...previous, ...newAttachments]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((previous) => {
      const attachment = previous.find((item) => item.id === id);

      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }

      return previous.filter((item) => item.id !== id);
    });
  };

  // -----------------------------
  // AUTO SCROLL
  // -----------------------------
  useEffect(() => {
    if (currentUser && authToken) {
      loadConversations();
    }
  }, [currentUser, authToken]);
  async function loadConversation(id: string) {
    try {
      const response = await authorizedFetch(
        ` https://personal-ai-assistant-1mud.onrender.com/api/conversations/${id}`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load conversation"
        );
      }

      const data = await response.json();

      const loadedMessages: Message[] =
        data.messages.map((message: any) => ({
          id: message._id,
          role: message.role,
          content: message.content,
        }));

      setMessages(loadedMessages);
      setConversationId(id);

      console.log(
        " Conversation loaded:",
        id
      );
    } catch (error) {
      console.error(
        " Failed to load conversation:",
        error
      );
    }
  }
  
  async function deleteConversation(id: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this chat?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await authorizedFetch(
        ` https://personal-ai-assistant-1mud.onrender.com/api/conversations/${id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Failed to delete conversation"
        );
      }

      // Remove from sidebar immediately
      setConversations((previous) =>
        previous.filter(
          (chat) => chat.id !== id
        )
      );

      // If the deleted chat is currently open
      if (conversationId === id) {
        setMessages([]);
        setConversationId(null);
      }

      console.log(
        "🗑️ Conversation deleted:",
        id
      );
    } catch (error) {
      console.error(
        "❌ Failed to delete conversation:",
        error
      );
    }
  }
  async function loadConversations() {
    try {
      const response = await authorizedFetch(
        " https://personal-ai-assistant-1mud.onrender.com/api/conversations"
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load conversations"
        );
      }

      const data = await response.json();

      setConversations(
        data.conversations.map(
          (conversation: any) => ({
            id: conversation._id,
            title: conversation.title,
            mode: conversation.mode,
            createdAt:
              conversation.createdAt,
            updatedAt:
              conversation.updatedAt,
          })
        )
      );
    } catch (error) {
      console.error(
        "❌ Failed to load conversations:",
        error
      );
    }
  }


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);



  // -----------------------------
  // VOICE INPUT
  // -----------------------------

  const startVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      window.alert(
        "Speech recognition is not supported in this browser. Please use Google Chrome."
      );
      return;
    }

    // If already listening, clicking the mic stops recording.
    if (isListening && voiceRecognitionRef.current) {
      voiceRecognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    voiceRecognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      console.log("🎙️ Voice recognition started");
    };

    recognition.onresult = (event) => {
      let transcript = "";

      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      setMessage(transcript);
    };

    recognition.onerror = (event) => {
      console.error(
        "🎙️ Speech recognition error:",
        event.error
      );

      setIsListening(false);
      voiceRecognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      voiceRecognitionRef.current = null;
      console.log("🎙️ Voice recognition ended");
    };

    try {
      recognition.start();
    } catch (error) {
      console.error(
        "🎙️ Failed to start voice recognition:",
        error
      );

      setIsListening(false);
      voiceRecognitionRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      voiceRecognitionRef.current?.stop();
      voiceRecognitionRef.current = null;
    };
  }, []);

  // -----------------------------
  // SEND MESSAGE
  // -----------------------------

  const sendMessage = async (
    customMessage?: string
  ) => {
    const trimmedMessage = (
      customMessage ?? message
    ).trim();

    const currentAttachments = attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.type,
      data: attachment.data,
    }));

    const finalMessage =
      trimmedMessage ||
      (currentAttachments.length > 0
        ? "Please analyze the attached file(s) and explain what you find."
        : "");

    if (!finalMessage || isGenerating) {
      return;
    }

    console.log(
      "🚀 Sending message to backend..."
    );

    // -----------------------------
    // USER MESSAGE
    // -----------------------------

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: finalMessage,
      attachments: attachments.map((attachment) => ({
        name: attachment.name,
        type: attachment.type,
      })),
    };

    const updatedMessages = [
      ...messages,
      userMessage,
    ];

    setMessages(updatedMessages);

    setMessage("");

    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    setAttachments([]);

    setIsGenerating(true);

    // -----------------------------
    // EMPTY AI MESSAGE
    // -----------------------------

    const assistantMessageId =
      crypto.randomUUID();

    setMessages((previous) => [
      ...previous,
      {
        id: assistantMessageId,
        role: "model",
        content: "",
      },
    ]);

    try {
      // -----------------------------
      // SEND TO BACKEND
      // -----------------------------

      const response = await authorizedFetch(
        " https://personal-ai-assistant-1mud.onrender.com/api/chat",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            ...((
              authToken ||
              localStorage.getItem("personal-ai-auth-token")
            )
              ? {
                  Authorization: `Bearer ${
                    authToken ||
                    localStorage.getItem("personal-ai-auth-token")
                  }`,
                }
              : {}),
          },

          body: JSON.stringify({
            conversationId,
            mode: "Assistant",
            messages: updatedMessages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            attachments: currentAttachments,
          }),
        }
      );

      console.log(
        "📡 Backend response status:",
        response.status
      );

      // -----------------------------
      // ERROR CHECK
      // -----------------------------

      if (!response.ok) {
        const errorText =
          await response.text();

        console.error(
          "❌ Backend error:",
          errorText
        );

        throw new Error(
          `Backend error ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error(
          "Backend returned no response body."
        );
      }

      // -----------------------------
      // READ STREAM
      // -----------------------------

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let buffer = "";

      while (true) {
        const { value, done } =
          await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true,
        });

        const events =
          buffer.split("\n\n");

        buffer =
          events.pop() || "";

        for (const event of events) {
          if (!event.startsWith("data:")) {
            continue;
          }

          const jsonString =
            event.replace(
              /^data:\s*/,
              ""
            );

          try {
            const data =
              JSON.parse(jsonString);

            // -----------------------------
            // AI TEXT CHUNK
            // -----------------------------

            if (
              data.type === "text"
            ) {
              setMessages(
                (previous) =>
                  previous.map(
                    (msg) =>
                      msg.id ===
                        assistantMessageId
                        ? {
                          ...msg,
                          content:
                            msg.content +
                            data.text,
                        }
                        : msg
                  )
              );
            }

            // -----------------------------
            // STREAM COMPLETE
            // -----------------------------

            if (data.type === "conversation") {
              const newConversationId =
                data.conversationId;

              setConversationId(newConversationId);

              console.log(
                "🆔 Conversation ID:",
                newConversationId
              );

              const firstUserMessage =
                updatedMessages.find(
                  (message) => message.role === "user"
                );

              setConversations((previous) => {
                const existingConversation =
                  previous.find(
                    (chat) =>
                      chat.id === newConversationId
                  );

                // Existing conversation
                if (existingConversation) {
                  return previous.map((chat) =>
                    chat.id === newConversationId
                      ? {
                        ...chat,
                        updatedAt:
                          new Date().toISOString(),
                      }
                      : chat
                  );
                }

                // New conversation
                const newChat: Chat = {
                  id: newConversationId,
                  title:
                    firstUserMessage?.content
                      ?.slice(0, 50) || "New Chat",
                  mode: "Assistant",
                  createdAt:
                    new Date().toISOString(),
                  updatedAt:
                    new Date().toISOString(),
                };

                return [newChat, ...previous];
              });
            }
            // -----------------------------
            // TOKEN USAGE
            // -----------------------------

            if (data.type === "usage" && data.usage) {
              const inputTokens = Number(data.usage.inputTokens || 0);
              const outputTokens = Number(data.usage.outputTokens || 0);
              const totalTokens = Number(
                data.usage.totalTokens ?? inputTokens + outputTokens
              );
              const contextRemaining = Math.max(
                0,
                CONTEXT_WINDOW_TOKENS - inputTokens
              );

              setLastTokenUsage({
                inputTokens,
                outputTokens,
                totalTokens,
                contextRemaining,
              });

              const accountTotalTokens =
                Number(data.usage.accountTotalTokens);

              setSessionTokensUsed(
                Number.isFinite(accountTotalTokens)
                  ? accountTotalTokens
                  : (previous) => previous + totalTokens
              );

              if (currentUser && Number.isFinite(accountTotalTokens)) {
                setCurrentUser((previous) =>
                  previous
                    ? {
                        ...previous,
                        usage: {
                          ...(previous.usage || {
                            totalInputTokens: 0,
                            totalOutputTokens: 0,
                            totalTokens: 0,
                            requestCount: 0,
                          }),
                          totalTokens: accountTotalTokens,
                          totalInputTokens:
                            Number(data.usage.accountTotalInputTokens) ||
                            previous.usage?.totalInputTokens ||
                            0,
                          totalOutputTokens:
                            Number(data.usage.accountTotalOutputTokens) ||
                            previous.usage?.totalOutputTokens ||
                            0,
                          requestCount:
                            Number(data.usage.accountRequestCount) ||
                            previous.usage?.requestCount ||
                            0,
                        },
                      }
                    : previous
                );
              }
            }

            // -----------------------------
            // SERVER ERROR
            // -----------------------------

            if (
              data.type === "error"
            ) {
              console.error(
                "❌ AI stream error:",
                data.message
              );

              setMessages(
                (previous) =>
                  previous.map(
                    (msg) =>
                      msg.id ===
                        assistantMessageId
                        ? {
                          ...msg,
                          content:
                            "Sorry, the AI encountered an error.",
                        }
                        : msg
                  )
              );
            }
          } catch (parseError) {
            console.error(
              "⚠️ Stream parsing error:",
              parseError
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "❌ Failed to communicate with backend:",
        error
      );

      setMessages(
        (previous) =>
          previous.map(
            (msg) =>
              msg.id ===
                assistantMessageId
                ? {
                  ...msg,
                  content:
                    "Sorry, I couldn't connect to the AI server. Please make sure the backend is running.",
                }
                : msg
          )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // -----------------------------
  // ENTER KEY
  // -----------------------------

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      sendMessage();
    }
  };

  // -----------------------------
  // NEW CHAT
  // -----------------------------

  const createNewChat = () => {
    setMessages([]);

    setMessage("");
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    setAttachments([]);
    setConversationId(null);

    setIsGenerating(false);
  };

  // -----------------------------
  // AUTH GATE
  // -----------------------------

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <div className="text-sm text-white/50">Loading your account...</div>
      </div>
    );
  }

  if (!currentUser || !authToken) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  // -----------------------------
  // UI
  // -----------------------------

  return (
    <>
      <style>{`
        .personal-ai-light .bg-black { background-color: #f7f7f7 !important; }
        .personal-ai-light .bg-[#080808] { background-color: #ffffff !important; }
        .personal-ai-light .bg-[#111111] { background-color: #ffffff !important; }
        .personal-ai-light [class*="bg-white/"] { background-color: rgba(0,0,0,0.04) !important; }
        .personal-ai-light [class*="text-white/"] { color: rgba(0,0,0,0.58) !important; }
        .personal-ai-light .text-white { color: #111111 !important; }
        .personal-ai-light [class*="border-white/"] { border-color: rgba(0,0,0,0.12) !important; }
        .personal-ai-light .placeholder\:text-white\/30::placeholder { color: rgba(0,0,0,0.35) !important; }
        .personal-ai-light body { background: #f7f7f7 !important; }
      `}</style>

      <div className="flex h-screen w-full overflow-hidden bg-black text-white">

      {/* MOBILE OVERLAY */}

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      {/* =========================
          SIDEBAR
      ========================= */}

      <aside
        className={`
          fixed md:relative z-40 h-full
          flex flex-col
          border-r border-white/10
          bg-[#080808]
          transition-all duration-300
          ${sidebarOpen
            ? "w-[280px]"
            : "w-0 overflow-hidden"
          }
        `}
      >

        {/* LOGO */}

        <div className="flex h-[70px] items-center justify-between px-5">

          <div className="flex items-center gap-3">

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black">
              <Sparkles size={19} />
            </div>

            <div>

              <h1 className="text-sm font-semibold tracking-wide">
                Personal AI
              </h1>

              <p className="text-[11px] text-white/40">
                Your intelligent assistant
              </p>

            </div>

          </div>

          <button
            onClick={() =>
              setSidebarOpen(false)
            }
            className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>

        </div>

        {/* NEW CHAT */}

        <div className="px-4">

          <button
            onClick={createNewChat}
            className="
              flex w-full items-center gap-3
              rounded-xl border border-white/10
              bg-white/[0.04]
              px-4 py-3
              text-sm font-medium
              transition
              hover:bg-white/[0.08]
            "
          >

            <Plus size={18} />

            <span>
              New chat
            </span>

            <span className="ml-auto text-xs text-white/30">
              Ctrl K
            </span>

          </button>

        </div>

        {/* SEARCH */}

        <div className="px-4 pt-3">

          <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3">

            <Search
              size={16}
              className="text-white/40"
            />

            <input
              placeholder="Search chats"
              className="
                w-full bg-transparent
                text-sm text-white
                outline-none
                placeholder:text-white/30
              "
            />

            <span className="text-xs text-white/20">
              /
            </span>

          </div>

        </div>

        {/* CHAT HISTORY */}

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-6">
            <div className="px-3 mb-2 text-xs text-gray-500">
              Today
            </div>

            {conversations
              .filter((chat) => {
                if (!chat.updatedAt) return true;

                const today = new Date();
                const chatDate = new Date(chat.updatedAt);

                return (
                  chatDate.toDateString() ===
                  today.toDateString()
                );
              })
              .map((chat) => (
                <div
                  key={chat.id}
                  className={`group flex items-center gap-1 rounded-lg mb-1 ${conversationId === chat.id
                      ? "bg-white text-black"
                      : "text-gray-300 hover:bg-[#1a1a1a]"
                    }`}
                >
                  <button
                    onClick={() =>
                      loadConversation(chat.id)
                    }
                    className="flex-1 min-w-0 text-left px-3 py-2 text-sm"
                  >
                    <div className="truncate">
                      {chat.title}
                    </div>
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteConversation(chat.id);
                    }}
                    className="mr-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 transition"
                    title="Delete chat"
                  >
                    <Trash2
                      size={15}
                      strokeWidth={1.8}
                    />
                  </button>
                </div>
              ))}
          </div>

          <div>
            <div className="px-3 mb-2 text-xs text-gray-500">
              Previous
            </div>

            {conversations
              .filter((chat) => {
                if (!chat.updatedAt) return false;

                const today = new Date();
                const chatDate = new Date(chat.updatedAt);

                return (
                  chatDate.toDateString() !==
                  today.toDateString()
                );
              })
              .map((chat) => (
                <div
                  key={chat.id}
                  className={`group flex items-center gap-1 rounded-lg mb-1 ${
                    conversationId === chat.id
                      ? "bg-white text-black"
                      : "text-gray-300 hover:bg-[#1a1a1a]"
                  }`}
                >
                  <button
                    onClick={() =>
                      loadConversation(chat.id)
                    }
                    className="flex-1 min-w-0 text-left px-3 py-2 text-sm"
                  >
                    <div className="truncate">
                      {chat.title}
                    </div>
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteConversation(chat.id);
                    }}
                    className="mr-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 transition"
                    title="Delete chat"
                  >
                    <Trash2
                      size={15}
                      strokeWidth={1.8}
                    />
                  </button>
                </div>
              ))}
          </div>
        </div>

        {/* SIDEBAR BOTTOM */}

        <div className="border-t border-white/10 p-3">

          <button
            onClick={openSettings}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-white"
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen((previous) => !previous)}
              title="Open account"
              aria-expanded={accountMenuOpen}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-white"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-black">
                {(currentUser?.name || currentUser?.email || "U")
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="flex flex-1 flex-col items-start min-w-0">
                <span className="w-full truncate text-left text-white/80">
                  {currentUser?.name || "Personal Account"}
                </span>
                <span className="w-full truncate text-left text-[10px] text-white/30">
                  {currentUser?.email || "Account"}
                </span>
              </div>

              <ChevronDown
                size={15}
                className={`transition-transform ${accountMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {accountMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-[#111111] p-2 shadow-2xl">
                <div className="rounded-xl bg-white/[0.04] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-black">
                      {(currentUser?.name || currentUser?.email || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {currentUser?.name || "Personal Account"}
                      </p>
                      <p className="truncate text-[11px] text-white/40">
                        {currentUser?.email}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white/[0.035] px-2.5 py-2">
                      <p className="text-[10px] text-white/35">Requests</p>
                      <p className="mt-0.5 text-sm font-medium text-white/80">
                        {Number(currentUser?.usage?.requestCount || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.035] px-2.5 py-2">
                      <p className="text-[10px] text-white/35">Total tokens</p>
                      <p className="mt-0.5 text-sm font-medium text-white/80">
                        {Number(currentUser?.usage?.totalTokens || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={openSettings}
                  className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/65 hover:bg-white/[0.05] hover:text-white"
                >
                  <Settings size={16} />
                  Account settings
                </button>

                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-300/80 hover:bg-red-500/10 hover:text-red-300"
                >
                  <LogOut size={16} />
                  Log out
                </button>
              </div>
            )}
          </div>

        </div>

      </aside>

      {/* =========================
          MAIN
      ========================= */}

      <main className="flex min-w-0 flex-1 flex-col">

        {/* HEADER */}

        <header className="flex h-[70px] items-center justify-between border-b border-white/10 px-4 md:px-6">

          <div className="flex items-center gap-3">

            <button
              onClick={() =>
                setSidebarOpen(
                  !sidebarOpen
                )
              }
              className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-2">

              <span className="text-sm font-semibold">
                {conversations.find(
                  (chat) => chat.id === conversationId
                )?.title || "Personal AI Assistant"}
              </span>

              <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/30">
                AI
              </span>

            </div>

          </div>

          <div className="flex items-center gap-2">

            <button className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-white">
              <Bell size={18} />
            </button>

            <button
              onClick={openSettings}
              className="hidden rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-white sm:block"
              title="Settings"
            >
              <Settings size={18} />
            </button>

            <button
              onClick={() => setAccountMenuOpen((previous) => !previous)}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white text-black text-xs font-semibold transition hover:scale-105"
              title={currentUser?.email || "Account"}
              aria-expanded={accountMenuOpen}
            >
              {(currentUser?.name || currentUser?.email || "U")
                .charAt(0)
                .toUpperCase()}
            </button>

          </div>

        </header>

        {/* =========================
            CHAT AREA
        ========================= */}

        <section className="flex flex-1 flex-col overflow-hidden">

          <div className="flex-1 overflow-y-auto">

            {messages.length === 0 ? (

              /* =========================
                 WELCOME SCREEN
              ========================= */

              <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center px-5 pb-20 pt-10">

                <div
                  className="
                    mb-7 flex h-16 w-16
                    items-center justify-center
                    rounded-2xl
                    border border-white/10
                    bg-white/[0.04]
                    shadow-[0_0_50px_rgba(255,255,255,0.04)]
                  "
                >
                  <Sparkles size={28} />
                </div>

                <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
                  How can I help you?
                </h2>

                <p className="mt-3 max-w-lg text-center text-sm leading-6 text-white/40">
                  Your personal AI assistant
                  for questions, ideas,
                  files, planning and everyday
                  tasks.
                </p>

                <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">

                  <Suggestion
                    title="Ask anything"
                    description="Get a clear answer to your question"
                    onClick={() =>
                      sendMessage(
                        "What can you help me with?"
                      )
                    }
                  />

                  <Suggestion
                    title="Work with a file"
                    description="Upload a file and ask me to analyze it"
                    onClick={() =>
                      sendMessage(
                        "What types of files can you analyze?"
                      )
                    }
                  />

                  <Suggestion
                    title="Analyze something"
                    description="Understand files, data or images"
                    onClick={() =>
                      sendMessage(
                        "What can you help me analyze?"
                      )
                    }
                  />

                  <Suggestion
                    title="Plan my day"
                    description="Organize tasks and priorities"
                    onClick={() =>
                      sendMessage(
                        "Help me plan my day."
                      )
                    }
                  />

                </div>

              </div>

            ) : (

              /* =========================
                 MESSAGES
              ========================= */

              <div className="mx-auto w-full max-w-4xl px-4 py-8">

                <div className="space-y-8">

                  {messages.map(
                    (msg) => (

                      <div
                        key={msg.id}
                        className={`
                          flex gap-4
                          ${msg.role ===
                            "user"
                            ? "justify-end"
                            : "justify-start"
                          }
                        `}
                      >

                        {/* AI ICON */}

                        {msg.role ===
                          "model" && (

                            <div
                              className="
                              flex h-8 w-8 shrink-0
                              items-center justify-center
                              rounded-lg
                              bg-white
                              text-black
                            "
                            >
                              <Sparkles
                                size={16}
                              />
                            </div>

                          )}

                        {/* MESSAGE */}

                        <div
                          className={`
                            max-w-[80%]
                            rounded-2xl
                            px-4 py-3
                            text-sm
                            leading-7
                            whitespace-pre-wrap
                            ${msg.role ===
                              "user"
                              ? "bg-white text-black"
                              : "bg-white/[0.05] text-white/90"
                            }
                          `}
                        >

                          {msg.content ? (
                            msg.content
                          ) : (

                            /* AI THINKING */

                            <span className="flex gap-1">

                              <span className="animate-bounce">
                                •
                              </span>

                              <span className="animate-bounce [animation-delay:150ms]">
                                •
                              </span>

                              <span className="animate-bounce [animation-delay:300ms]">
                                •
                              </span>

                            </span>

                          )}

                        </div>

                      </div>

                    )
                  )}

                  <div
                    ref={messagesEndRef}
                  />

                </div>

              </div>

            )}

          </div>

          {/* =========================
              INPUT AREA
          ========================= */}

          <div className="w-full px-4 pb-5 md:px-6">

            <div className="mx-auto max-w-4xl">

              {/* TOOLS */}

              <div className="mb-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowTokenUsage((prev) => !prev)}
                  className={`
                    flex shrink-0 items-center gap-1.5
                    rounded-full border px-3 py-1.5
                    text-xs transition
                    ${showTokenUsage
                      ? "border-white/20 bg-white text-black"
                      : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
                    }
                  `}
                  title="Show token usage"
                  aria-expanded={showTokenUsage}
                >
                  <Sparkles size={12} />
                  Tokens
                </button>
              </div>

              {/* TOKEN USAGE — SLIDE DOWN */}

              <div
                className={`
                  overflow-hidden transition-all duration-300 ease-out
                  ${showTokenUsage
                    ? "mb-3 max-h-60 translate-y-0 opacity-100"
                    : "mb-0 max-h-0 -translate-y-1 opacity-0"
                  }
                `}
                aria-hidden={!showTokenUsage}
              >
                <div
                  className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5"
                  title="Context remaining is an estimate for the latest request, not your Google API quota."
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-white/75">
                      <Sparkles size={13} />
                      Token usage
                    </div>
                    <div className="text-[10px] text-white/35">
                      Session total: {sessionTokensUsed.toLocaleString()} tokens
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-white/[0.035] px-2.5 py-2">
                      <p className="text-[10px] text-white/35">Input · latest</p>
                      <p className="mt-0.5 text-sm font-semibold text-white/85">
                        {lastTokenUsage ? lastTokenUsage.inputTokens.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.035] px-2.5 py-2">
                      <p className="text-[10px] text-white/35">Output · latest</p>
                      <p className="mt-0.5 text-sm font-semibold text-white/85">
                        {lastTokenUsage ? lastTokenUsage.outputTokens.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.035] px-2.5 py-2">
                      <p className="text-[10px] text-white/35">Total · latest</p>
                      <p className="mt-0.5 text-sm font-semibold text-white/85">
                        {lastTokenUsage ? lastTokenUsage.totalTokens.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.035] px-2.5 py-2">
                      <p className="text-[10px] text-white/35">Context remaining*</p>
                      <p className="mt-0.5 text-sm font-semibold text-white/85">
                        {lastTokenUsage ? lastTokenUsage.contextRemaining.toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-1.5 text-[10px] text-white/25">
                    *Estimated from a 1,048,576-token context window for Gemini 3.7 Flash. This is not your remaining daily/API quota.
                  </p>
                </div>
              </div>

              {/* ATTACHMENT PREVIEW */}

              {attachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2"
                    >
                      {attachment.previewUrl ? (
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06]">
                          <FileText size={18} className="text-white/60" />
                        </div>
                      )}

                      <div className="min-w-0 max-w-[200px]">
                        <p className="truncate text-xs text-white/80">
                          {attachment.name}
                        </p>
                        <p className="text-[10px] text-white/30">
                          {(attachment.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        disabled={isGenerating}
                        className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-30"
                        title="Remove attachment"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* COMPOSER */}

              <div
                className="
                  rounded-2xl
                  border border-white/10
                  bg-[#111111]
                  shadow-2xl
                  transition
                  focus-within:border-white/20
                "
              >

                <textarea
                  value={message}
                  onChange={(event) =>
                    setMessage(
                      event.target.value
                    )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  rows={1}
                  disabled={
                    isGenerating
                  }
                  placeholder={
                    isGenerating
                      ? "AI is thinking..."
                      : "Message your AI assistant..."
                  }
                  className="
                    max-h-40
                    min-h-[56px]
                    w-full
                    resize-none
                    bg-transparent
                    px-5 pt-4
                    text-sm
                    text-white
                    outline-none
                    placeholder:text-white/30
                    disabled:opacity-50
                  "
                />

                <div className="flex items-center justify-between px-3 pb-3">

                  <div className="flex items-center gap-1">

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isGenerating}
                      title="Attach a file"
                      className="rounded-lg p-2 text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                      <Paperclip size={18} />
                    </button>

                    <button
                      type="button"
                      onClick={startVoiceInput}
                      disabled={isGenerating}
                      className={`rounded-lg p-2 transition disabled:opacity-30 ${
                        isListening
                          ? "bg-white text-black"
                          : "text-white/40 hover:bg-white/10 hover:text-white"
                      }`}
                      title={
                        isListening
                          ? "Stop listening"
                          : "Voice input"
                      }
                    >
                      <Mic
                        size={18}
                        className={
                          isListening
                            ? "animate-pulse"
                            : ""
                        }
                      />
                    </button>

                  </div>

                  <button
                    onClick={() =>
                      sendMessage()
                    }
                    disabled={
                      (!message.trim() && attachments.length === 0) ||
                      isGenerating
                    }
                    className="
                      flex h-9 w-9
                      items-center
                      justify-center
                      rounded-xl
                      bg-white
                      text-black
                      transition
                      hover:bg-white/90
                      disabled:cursor-not-allowed
                      disabled:bg-white/10
                      disabled:text-white/20
                    "
                  >

                    <ArrowUp size={18} />

                  </button>

                </div>

              </div>

              <p className="mt-3 text-center text-[10px] text-white/20">
                AI can make mistakes.
                Check important
                information.
              </p>

            </div>

          </div>

        </section>

      </main>

      {/* ACCOUNT MENU FROM HEADER */}
      {accountMenuOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setAccountMenuOpen(false)}
        >
          <div
            className="absolute right-4 top-[58px] w-72 rounded-2xl border border-white/10 bg-[#111111] p-2 shadow-2xl md:right-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rounded-xl bg-white/[0.04] px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-black">
                  {(currentUser?.name || currentUser?.email || "U")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {currentUser?.name || "Personal Account"}
                  </p>
                  <p className="truncate text-[11px] text-white/40">
                    {currentUser?.email}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-[11px] text-white/40">
                <Mail size={13} />
                <span>Email verified</span>
              </div>

              {currentUser?.createdAt && (
                <p className="mt-1 text-[10px] text-white/25">
                  Member since {new Date(currentUser.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>

            <button
              onClick={openSettings}
              className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/65 hover:bg-white/[0.05] hover:text-white"
            >
              <Settings size={16} />
              Settings
            </button>

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-300/80 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111111] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Settings</h2>
                <p className="mt-1 text-xs text-white/40">
                  Customize your Personal AI experience.
                </p>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <Palette size={16} className="text-white/60" />
                <h3 className="text-sm font-medium text-white/85">Theme</h3>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "dark" as const, label: "Dark", icon: Moon },
                  { value: "light" as const, label: "Light", icon: Sun },
                  { value: "system" as const, label: "System", icon: Monitor },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-xs transition ${
                      theme === value
                        ? "border-white/25 bg-white text-black"
                        : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>

              <p className="mt-3 text-[11px] leading-5 text-white/30">
                Your theme preference is saved on this device and will be restored the next time you open the app.
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <p className="text-xs font-medium text-white/75">Account</p>
              <p className="mt-1 truncate text-xs text-white/35">
                {currentUser?.name} · {currentUser?.email}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
    </>
  );
}



// ======================================
// AUTH SCREEN
// ======================================

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (token: string, user: AuthUser) => void;
}) {
  type AuthMode =
    | "login"
    | "register"
    | "verify-email"
    | "forgot-password"
    | "reset-password";

  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const callAuth = async (endpoint: string, body: Record<string, string>) => {
    const response = await fetch(` https://personal-ai-assistant-1mud.onrender.com/api/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter your email address.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        if (name.trim().length < 2) {
          throw new Error("Name must be at least 2 characters.");
        }
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
          throw new Error("Password must be at least 8 characters and contain a letter and a number.");
        }

        const data = await callAuth("register", {
          name: name.trim(),
          email: cleanEmail,
          password,
        });
        setMode("verify-email");
        setNotice(data.message || "Check your inbox for the 6-digit verification code.");
        setCode("");
        return;
      }

      if (mode === "verify-email") {
        if (!/^\d{6}$/.test(code.trim())) {
          throw new Error("Enter the 6-digit code sent to your email.");
        }
        const data = await callAuth("verify-email", {
          email: cleanEmail,
          code: code.trim(),
        });
        onAuthenticated(data.token, data.user);
        return;
      }

      if (mode === "forgot-password") {
        const data = await callAuth("forgot-password", { email: cleanEmail });
        setMode("reset-password");
        setCode("");
        setNotice(data.message || "If the account exists, a reset code has been sent.");
        return;
      }

      if (mode === "reset-password") {
        if (!/^\d{6}$/.test(code.trim())) {
          throw new Error("Enter the 6-digit code sent to your email.");
        }
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
          throw new Error("New password must be at least 8 characters and contain a letter and a number.");
        }
        const data = await callAuth("reset-password", {
          email: cleanEmail,
          code: code.trim(),
          password,
        });
        setMode("login");
        setPassword("");
        setCode("");
        setNotice(data.message || "Password reset. You can now sign in.");
        return;
      }

      const data = await callAuth("login", {
        email: cleanEmail,
        password,
      });
      onAuthenticated(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const description =
    mode === "login" ? "Sign in to continue to your personal workspace." :
    mode === "register" ? "We'll email you a code to confirm this email belongs to you." :
    mode === "verify-email" ? `Enter the 6-digit code sent to ${email}.` :
    mode === "forgot-password" ? "We'll send a password reset code if this email has an account." :
    `Enter the reset code sent to ${email}, then choose a new password.`;

  const showEmail = true;
  const showPassword = mode === "login" || mode === "register" || mode === "reset-password";
  const showCode = mode === "verify-email" || mode === "reset-password";

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black">
            <Sparkles size={25} />
          </div>
          <h1 className="text-2xl font-semibold">Personal AI Assistant</h1>
          <p className="mt-2 text-sm text-white/40">{description}</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl">
          {mode === "register" && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-white/50">Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none transition focus:border-white/25"
              />
            </div>
          )}

          {showEmail && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-white/50">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                readOnly={mode === "verify-email" || mode === "reset-password"}
                className={`w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none transition focus:border-white/25 ${mode === "verify-email" || mode === "reset-password" ? "opacity-60" : ""}`}
              />
            </div>
          )}

          {showCode && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-white/50">6-digit email code</label>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-lg tracking-[0.35em] outline-none transition focus:border-white/25"
              />
              <p className="mt-2 text-[11px] text-white/35">The code expires after 10 minutes. Check your spam folder if it doesn't appear.</p>
            </div>
          )}

          {showPassword && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-white/50">
                {mode === "reset-password" ? "New password" : "Password"}
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "login" ? "Your password" : "8+ characters, including a number"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none transition focus:border-white/25"
              />
            </div>
          )}

          {notice && (
            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs leading-relaxed text-emerald-300">
              {notice}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? "Please wait..." :
              mode === "login" ? "Sign in" :
              mode === "register" ? "Send verification code" :
              mode === "verify-email" ? "Verify email and create account" :
              mode === "forgot-password" ? "Send reset code" :
              "Reset password"}
          </button>

          {mode === "login" && (
            <button
              type="button"
              onClick={() => { setMode("forgot-password"); setError(""); setNotice(""); }}
              className="mt-4 w-full text-center text-xs text-white/50 transition hover:text-white"
            >
              Forgot password?
            </button>
          )}

          {(mode === "verify-email" || mode === "reset-password") && (
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setError("");
                setNotice("");
                setLoading(true);
                try {
                  const endpoint = mode === "verify-email" ? "register" : "forgot-password";
                  const body = mode === "verify-email"
                    ? { name: name.trim(), email: email.trim().toLowerCase(), password }
                    : { email: email.trim().toLowerCase() };
                  const data = await callAuth(endpoint, body as Record<string, string>);
                  setNotice(data.message || "A new code has been requested.");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not resend code.");
                } finally {
                  setLoading(false);
                }
              }}
              className="mt-3 w-full text-center text-xs text-white/50 transition hover:text-white disabled:opacity-50"
            >
              Resend code
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const nextMode: AuthMode =
                mode === "login" ? "register" :
                mode === "register" ? "login" :
                mode === "forgot-password" ? "login" :
                "login";
              setMode(nextMode);
              setError("");
              setNotice("");
              setCode("");
              setPassword("");
            }}
            className="mt-4 w-full text-center text-xs text-white/40 transition hover:text-white"
          >
            {mode === "login" ? "Don't have an account? Create one" :
             mode === "register" ? "Already have an account? Sign in" :
             "Back to sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-[10px] text-white/20">
          Email ownership is verified using a one-time code. Passwords are hashed on the server, and account data stays private to your account.
        </p>
      </div>
    </div>
  );
}

// ======================================
// SUGGESTION COMPONENT
// ======================================

function Suggestion({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="
        group
        rounded-xl
        border border-white/10
        bg-white/[0.025]
        p-4
        text-left
        transition-all
        duration-200
        hover:-translate-y-0.5
        hover:border-white/20
        hover:bg-white/[0.05]
      "
    >

      <p className="text-sm font-medium text-white">
        {title}
      </p>

      <p className="mt-1 text-xs leading-5 text-white/35">
        {description}
      </p>

    </button>
  );
}

export default App;