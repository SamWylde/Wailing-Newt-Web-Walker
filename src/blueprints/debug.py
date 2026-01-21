from flask import Blueprint, jsonify

from src.app_state import crawler_instances, instances_lock
from src.auth_utils import login_required


debug_bp = Blueprint('debug', __name__)


@debug_bp.route('/api/debug/memory')
@login_required
def debug_memory():
    """Debug endpoint showing memory stats for all active crawler instances."""
    from src.core.memory_profiler import MemoryProfiler

    with instances_lock:
        memory_stats = {
            'total_instances': len(crawler_instances),
            'instances': []
        }

        for session_id, instance_data in crawler_instances.items():
            crawler = instance_data['crawler']
            stats = crawler.memory_monitor.get_stats()

            data_sizes = MemoryProfiler.get_crawler_data_size(
                crawler.crawl_results,
                crawler.link_manager.all_links if crawler.link_manager else [],
                crawler.issue_detector.detected_issues if crawler.issue_detector else []
            )

            memory_stats['instances'].append({
                'session_id': session_id[:8] + '...',
                'last_accessed': instance_data['last_accessed'].isoformat(),
                'urls_crawled': len(crawler.crawl_results),
                'memory': stats,
                'data_sizes': data_sizes
            })

        return jsonify(memory_stats)


@debug_bp.route('/api/debug/memory/profile')
@login_required
def debug_memory_profile():
    """Detailed memory profiling - what's actually using the RAM."""
    from src.core.memory_profiler import MemoryProfiler

    with instances_lock:
        profiles = []

        for session_id, instance_data in crawler_instances.items():
            crawler = instance_data['crawler']

            breakdown = MemoryProfiler.get_object_memory_breakdown()

            data_sizes = MemoryProfiler.get_crawler_data_size(
                crawler.crawl_results,
                crawler.link_manager.all_links if crawler.link_manager else [],
                crawler.issue_detector.detected_issues if crawler.issue_detector else []
            )

            profiles.append({
                'session_id': session_id[:8] + '...',
                'urls_crawled': len(crawler.crawl_results),
                'object_breakdown': breakdown,
                'data_sizes': data_sizes
            })

        return jsonify({
            'total_instances': len(crawler_instances),
            'profiles': profiles
        })
