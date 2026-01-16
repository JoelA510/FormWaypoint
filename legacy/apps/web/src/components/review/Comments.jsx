import { useState, useEffect } from 'react';
import { MessageSquare, Send, Globe, Lock } from 'lucide-react';
import { api } from '../../services/api';

export default function Comments({ documentId, user, viewMode = 'internal' }) {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [activeTab, setActiveTab] = useState('public'); // 'team' | 'public'
    const [isInternalNote, setIsInternalNote] = useState(false);

    useEffect(() => {
        loadComments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

    useEffect(() => {
        if (viewMode === 'client') {
            setActiveTab('public');
        } else {
            setActiveTab('team'); // Default to Team for internal users
        }
    }, [viewMode]);

    const loadComments = async () => {
        try {
            const data = await api.getComments(documentId);
            setComments(data);
        } catch (error) {
            console.error('Failed to load comments:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        setIsSending(true);
        try {
            const textToSend = (isInternalNote && viewMode === 'internal')
                ? `[INTERNAL] ${newComment}`
                : newComment;

            const comment = await api.addComment(documentId, textToSend, user);
            setComments([comment, ...comments]);
            setNewComment('');
            if (viewMode === 'internal') setIsInternalNote(false); // Reset internal toggle

            // Create notification for document owner (simplified - in production would notify specific users)
            try {
                // const token = localStorage.getItem('token');
                // This would ideally be called server-side when comment is created
                // For now, we're demonstrating the integration
                console.log('Comment added, notification system ready for server-side integration');
            } catch (notifError) {
                console.log('Notification creation skipped (expected in current setup)');
            }
        } catch (error) {
            console.error('Failed to add comment:', error);
        } finally {
            setIsSending(false);
        }
    };

    const filteredComments = comments.filter(c => {
        if (activeTab === 'team') return true; // Show everything in Team tab
        return !c.text.startsWith('[INTERNAL]'); // Hide internal notes in Public tab
    });

    return (
        <div className="card h-full flex flex-col bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-slate-500" />
                        <h3 className="font-semibold text-slate-900">Comments</h3>
                        <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                            {filteredComments.length}
                        </span>
                    </div>
                </div>

                {/* Tabs for Internal View */}
                {viewMode === 'internal' && (
                    <div className="flex gap-1 text-sm bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('team')}
                            className={`flex-1 py-1.5 px-3 rounded-md flex items-center justify-center gap-2 transition-all ${activeTab === 'team' ? 'bg-white shadow text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <Lock className="w-3 h-3" /> Team
                        </button>
                        <button
                            onClick={() => setActiveTab('public')}
                            className={`flex-1 py-1.5 px-3 rounded-md flex items-center justify-center gap-2 transition-all ${activeTab === 'public' ? 'bg-white shadow text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <Globe className="w-3 h-3" /> Public
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px]">
                {isLoading ? (
                    <div className="text-center text-slate-400 py-4">Loading comments...</div>
                ) : filteredComments.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 text-sm">
                        {activeTab === 'team' ? 'No comments yet.' : 'No public comments visible.'}
                    </div>
                ) : (
                    filteredComments.map((comment) => {
                        const isInternal = comment.text.startsWith('[INTERNAL]');
                        const displayText = isInternal ? comment.text.replace('[INTERNAL] ', '') : comment.text;

                        return (
                            <div key={comment.id} className="flex gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isInternal ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                    {(comment.user?.username || 'U')[0].toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <div className={`rounded-2xl rounded-tl-none p-3 border shadow-sm ${isInternal ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'
                                        }`}>
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="font-medium text-sm text-slate-900 flex items-center gap-2">
                                                {comment.user?.username || 'Unknown User'}
                                                {isInternal && <Lock className="w-3 h-3 text-amber-500" />}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {new Date(comment.createdAt).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{displayText}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    {viewMode === 'internal' && (
                        <div className="flex items-center gap-2 px-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={isInternalNote}
                                    onChange={(e) => setIsInternalNote(e.target.checked)}
                                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                                />
                                <span className={`text-xs font-medium ${isInternalNote ? 'text-amber-700' : 'text-slate-500'}`}>
                                    Make Internal Note
                                </span>
                            </label>
                            {isInternalNote && <Lock className="w-3 h-3 text-amber-600" />}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder={isInternalNote ? "Write an internal note..." : "Write a public comment..."}
                            className={`flex-1 input-field text-sm ${isInternalNote ? 'border-amber-200 focus:border-amber-400 focus:ring-amber-200' : ''}`}
                            disabled={isSending}
                            aria-label="Write a comment"
                        />
                        <button
                            type="submit"
                            disabled={!newComment.trim() || isSending}
                            className={`btn-primary p-2 aspect-square flex items-center justify-center ${isInternalNote ? 'bg-amber-600 hover:bg-amber-700' : ''
                                }`}
                            aria-label="Send comment"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
