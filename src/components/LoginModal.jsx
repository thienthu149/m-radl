import { useState } from 'react';

export default function LoginModal({ loginUser, registerUser, loginGuest, error }) {
    console.log("LoginModal loaded");
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [isRegister, setIsRegister] = useState(false);
    const handleSubmit = (e) => {
        e.preventDefault();
        if (isRegister) {
            registerUser(nickname, password);
        } else {
            loginUser(nickname, password);
        }
    };
    return ( <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"> <div className="bg-gray-800 p-6 rounded-xl shadow-2xl max-w-sm w-full border border-gray-700 m-4"> <h3 className="text-lg font-bold mb-4">{isRegister ? 'Register' : 'Login'}</h3>
    {error && <div className="text-red-500 text-sm mb-2">{error}</div>} <form onSubmit={handleSubmit} className="space-y-4">
        <input
        type="text"
        placeholder="Nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        className="w-full bg-gray-700 p-3 rounded-lg border border-gray-600 text-white focus:ring-2 focus:ring-blue-500 outline-none"
        required
        />
        <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full bg-gray-700 p-3 rounded-lg border border-gray-600 text-white focus:ring-2 focus:ring-blue-500 outline-none"
        required
        /> <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-medium">
            {isRegister ? 'Register' : 'Login'} </button> </form> <div className="flex justify-between mt-4">
                <button onClick={() => setIsRegister(!isRegister)} className="text-sm text-gray-300 underline">
                    {isRegister ? 'Back to Login' : 'Create Account'} </button> <button onClick={loginGuest} className="text-sm text-gray-300 underline">
                        Continue as Guest </button> </div> </div> </div>
    );
}
