import React, { createContext, useState } from 'react'

export const LanguageContext = createContext();
export function LanguageContextWrapper({ children }) {

    const [language, setLanguage] = useState("EN");

    return (
        <LanguageContext.Provider value={{ language, setLanguage }}>
            {children}
        </LanguageContext.Provider>
    )
}
