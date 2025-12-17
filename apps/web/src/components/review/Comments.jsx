import { useState, useEffect } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { api } from '../../services/api';

export default function Comments({ documentId, user }) {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        loadComments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

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
            const comment = await api.addComment(documentId, newComment, user);
            setComments([comment, ...comments]);
            setNewComment('');

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

    return (
        <div className="card h-full flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-slate-500" />
                <h3 className="font-semibold text-slate-900">Comments</h3>
                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                    {comments.length}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px]">
                {isLoading ? (
                    <div className="text-center text-slate-400 py-4">Loading comments...</div>
                ) : comments.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 text-sm">
                        No comments yet. Start the conversation!
                    </div>
                ) : (
                    comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold shrink-0">
                                {(comment.user?.username || 'U')[0].toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <div className="bg-slate-50 rounded-2xl rounded-tl-none p-3 border border-slate-100 shadow-sm">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="font-medium text-sm text-slate-900">
                                            {comment.user?.username || 'Unknown User'}
                                        </span>
                                        <span className="text-xs text-slate-400">
                                            {new Date(comment.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{comment.text}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write a comment..."
                        className="flex-1 input-field text-sm"
                        disabled={isSending}
                        aria-label="Write a comment"
                    />
                    <button
                        type="submit"
                        disabled={!newComment.trim() || isSending}
                        className="btn-primary p-2 aspect-square flex items-center justify-center"
                        aria-label="Send comment"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}
