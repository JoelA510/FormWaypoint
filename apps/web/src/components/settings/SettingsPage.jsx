
import { useFeatureFlags } from '../../context/FeatureFlagContext';


const SettingsPage = () => {
    const { features } = useFeatureFlags();

    return (
        <>
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                        System Configuration
                    </h2>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Feature Flags</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                        Current status of feature toggles.
                    </p>
                </div>
                <div className="border-t border-gray-200">
                    <dl>
                        {Object.entries(features).map(([key, enabled], index) => (
                            <div key={key} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6`}>
                                <dt className="text-sm font-medium text-gray-500">
                                    {key}
                                </dt>
                                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 flex items-center">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {enabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
            <div className="mt-6 text-sm text-gray-400 italic">
                Note: Feature flags are controlled by backend environment variables.
            </div>
        </>
    );
};

export default SettingsPage;
